# Design

## Context

`chore/merge-upstream-2026-05` 合并引入了 scope-resolution phase（upstream RFC #909 Ring 3），替换 legacy DAG 为 C# 等已迁移语言生成 CALLS/IMPORTS/ACCESSES 边。但 parse worker 与 scope-resolution 之间的数据桥是断裂的：

- Worker 在 parse 阶段已用 tree-sitter Tree（缓存命中）产出了 `ParsedFile[]`，通过 IPC 发回主线程
- `parse-impl.ts` 忽略 `chunkWorkerData.parsedFiles`
- `scopeResolutionPhase` 无条件重新读文件、重新 tree-sitter parse、重新 scope 提取

对 Unity C# 项目（如 neonnew 8192 .cs 文件），这导致 ~2× parse + 2× scope extraction，是 130s → 900s 性能退化的主要原因之一。

## Goals / Non-Goals

**Goals:**
- 桥接 worker 产出的 `ParsedFile[]` 至 scope-resolution phase，消除二次 tree-sitter parse
- 对 registry-primary 语言跳过 worker 侧的冗余 scope 提取和 legacy 提取
- 为 scope-resolution phase 添加 per-stage 进度回调
- 重构 `populateCsharpNamespaceSiblings` 从 `ParsedFile` 数据提取 namespace 信息
- 保持向后兼容：sequential path、非 registry-primary 语言、空 worker 输出均 fallback 到现有路径

**Non-Goals:**
- 不修改 `gitnexus-shared` 中的 `ParsedFile` 类型定义
- 不修改 `finalizeScopeModel` / `resolveReferenceSites`（上游 shared 包）
- 不合并 parse phase 与 scope-resolution phase 为单一 phase
- 不修改非 C# 语言的 scope-resolution 路径
- 不修改 Unity 功能（`unityScanPhase` / `unityEnrichPhase` / `applyUnityLifecycleSyntheticCalls`）

## Decisions

### D1: ParsedFile 跨 IPC 可行性 — 已验证，无需修改

`ParseWorkerResult.parsedFiles: ParsedFile[]` 已在 worker 中序列化并通过 `parentPort.postMessage` 发送至主线程。`ParsedFile` 是纯结构化数据（`gitnexus-shared` 定义），不含 native/WASM 引用，跨 MessageChannel 序列化已验证。本 change 只做转发，不修改 `ParsedFile` 类型。

### D2: 转发路径 — parse-impl → ParseOutput → scope-resolution

```
parse-impl.ts (累积 parsedFiles)
  → ParseOutput.preExtractedParsedFiles (新增可选字段)
    → scopeResolution phase.ts (检测并传递)
      → runScopeResolution(preExtractedParsedFiles) (跳过 extract)
```

**理由**：利用现有 phase DAG 通信机制（`getPhaseOutput`），不引入新的跨 phase 通道。`preExtractedParsedFiles` 为 `readonly ParsedFile[] | undefined`，`undefined` 语义 = "无预提取数据，走现有路径"。

### D3: Worker 侧跳过冗余提取 — 条件：`isRegistryPrimary(language) === true`

在 `parse-worker.ts` 的 `processBatch` / `processFileWithQuery` 中，对 `isRegistryPrimary(language)` 返回 true 的语言：
- 跳过 `extractParsedFile` 调用（ParsedFile 会在 scope-resolution 侧通过预提取数据消费）
- 跳过 legacy query extraction（calls/imports/heritage 全部被 `isRegistryPrimary` gate 在 `processCallsFromExtracted` / `processImportsFromExtracted` 中跳过）

**理由**：彻底消除 worker 侧无用功。对 registry-primary 语言，两个提取路径（scope + legacy）的产出都不被当前代码消费。注意：`extractParsedFile` 仍在 worker 中为 non-registry-primary 语言执行。

**特殊考虑**：这条决策要求 parse worker 能访问 `isRegistryPrimary`。当前 `parse-worker.ts` 已 import `getProvider` 和 `getLanguageFromFilename`，`isRegistryPrimary` 在 `registry-primary-flag.ts` 中，需要新增 import。Worker 不依赖 Node.js 特定 API，此 import 安全。

### D4: scopeResolution 跳过 extract — 条件：`preExtractedParsedFiles` 非空

在 `runScopeResolution` 中：
- 新增 `preExtractedParsedFiles?: readonly ParsedFile[]` 参数
- 当 `preExtractedParsedFiles.length > 0` 时，跳过 `readFileContents` + per-file `extractParsedFile` 循环
- 仍对每个 ParsedFile 调用 `provider.populateOwners(parsed)`（补充 owner 归属信息）
- `fileContents` 构建方式改为从 `preExtractedParsedFiles` 的 filePath 映射（从 `files` 参数读取，或延迟到需要时再读）

**理由**：最小化 scope-resolution 内部改动。extract 阶段完全跳过，后续 finalize/resolve/emit 阶段不变。

### D5: Namespace-siblings 从 ParsedFile 提取 — 优先路径，tree-sitter fallback

`populateCsharpNamespaceSiblings` 的 `extractFileStructure` 当前遍历 tree-sitter AST 提取 namespace 名和 using-static 路径。改为：

1. **优先路径**：从 `ParsedFile.parsedImports` 中提取 namespace 信息。C# scope extraction 的 `emitCsharpScopeCaptures` 已将 `using_directive` 分解为 `ParsedImport` 条目（通过 `splitUsingDirective`），这些条目包含 `kind` / `targetRaw` 等信息，可推导出 namespace 名和 using-static 路径。
2. **Fallback 路径**：当 `ParsedFile` 缺乏足够信息时，回退到 tree-sitter AST walk（保持现有行为）。

**namespace 名推导逻辑**：遍历 `ParsedFile.scopes`，找到 `kind === 'namespace'` 的 scope，其 `name` 即为 namespace 名。C# 中每个文件通常只有一个 namespace（或为 global namespace）。

**using-static 推导逻辑**：遍历 `ParsedFile.parsedImports`，找到 `kind === 'using-static'` 的条目，`targetRaw` 即为 using-static 路径。

### D6: 进度回调 — 轻量 per-stage 事件

在 `scopeResolutionPhase.execute()` 和 `runScopeResolution` 中，对每个阶段（extract/finalize/resolve/emit）发送 `ctx.onProgress` 事件。使用 phase name `'scopeResolution'`，复用现有 `PipelineProgress` 接口。

## Risks / Migration

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Worker ParsedFile 与 scopeResolution 重提取的 ParsedFile 内容不一致 | 低 | 低 — 调用链行为可能微变 | 相同 source + parser → 应产出一致结果。E2E 测试验证 CALLS/IMPORTS 边 count 不变 |
| Registry-primary 跳过 worker 提取后，某些非 primary 路径仍依赖 worker 提取数据 | 低 | 中 — 缺失边 | `isRegistryPrimary` gate 已在 call-processor/import-processor 中跳过，worker 提取数据未被消费。代码审查确认无遗漏依赖 |
| Namespace 从 ParsedFile 提取的名称与 tree-sitter AST 不一致 | 低 | 低 — namespace 名可能错误 | Fallback 路径保留 tree-sitter walk。优先路径仅当 namespace scope 明确存在时使用 |
| scope-resolution 进度回调频率过高导致 progress bar 闪烁 | 低 | 低 — UI 干扰 | 仅 per-stage（4 次），非 per-file。与现有 parse phase 的 per-file 回调相比极低频 |
| `preExtractedParsedFiles` 数组内存占用（8192 ParsedFile 对象） | 中 | 低 — 仅活到 scopeResolution 结束 | ParsedFile 是结构化数据，单个 ~2-5KB，8192 个 ~20-40MB。远小于 Tree objects（每个 ~50-200KB，8192 个 ~400MB-1.6GB）。scopeResolution 结束后 GC 回收 |
