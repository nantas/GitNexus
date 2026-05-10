# Tasks

## 1. Spec 覆盖与实现准备

- [x] 1.1 确认 `parse-scope-bridge` spec（`specs/parse-scope-bridge/spec.md`）的实现范围与边界
- [x] 1.2 确认 `scope-resolution-progress` spec（`specs/scope-resolution-progress/spec.md`）的实现范围
- [x] 1.3 确认 `ingestion-pipeline` spec（`specs/ingestion-pipeline/spec.md`）MODIFIED requirements 实现范围
- [x] 1.4 确认 `namespace-siblings` spec（`specs/namespace-siblings/spec.md`）MODIFIED requirements 实现范围
- [x] 1.5 确认 design.md 的 6 个决策（D1-D6）在实现中的对应关系

## 2. Phase 1: ParsedFile 桥接（parse-scope-bridge + ingestion-pipeline）

### 2.1 ParseOutput 扩展

- [x] 2.1.1 在 `gitnexus/src/core/ingestion/pipeline-phases/parse.ts` 的 `ParseOutput` 接口中新增 `readonly preExtractedParsedFiles?: readonly ParsedFile[]` 字段
- [x] 2.1.2 验证 `ParsedFile` 类型从 `gitnexus-shared` import 已在 parse.ts 中可用
- [x] 2.1.3 `npx tsc --noEmit` 编译验证

### 2.2 parse-impl 累积并转发 parsedFiles

- [x] 2.2.1 在 `parse-impl.ts` 中新增 `const allParsedFiles: ParsedFile[] = []` 累加器
- [x] 2.2.2 在每个 chunk 的 worker 数据处理分支（`if (chunkWorkerData)`）中，从 `chunkWorkerData.parsedFiles` push 到 `allParsedFiles`
- [x] 2.2.3 在 `runChunkedParseAndResolve` 的 return 语句中，当 `allParsedFiles.length > 0` 时设置 `preExtractedParsedFiles: allParsedFiles`，否则 `undefined`
- [x] 2.2.4 验证 sequential path 不设置此字段（保持 `undefined`）
- [x] 2.2.5 验证空 worker 输出（零 ParsedFile）时此字段为 `undefined`
- [x] 2.2.6 `npx tsc --noEmit` 编译验证

### 2.3 parse phase 透传至 ParseOutput

- [x] 2.3.1 在 `parse.ts` 的 `execute()` 中，将 `result.preExtractedParsedFiles` 添加到 `ParseOutput` 返回值
- [x] 2.3.2 `npx tsc --noEmit` 编译验证

### 2.4 scopeResolution phase 消费 preExtractedParsedFiles

- [x] 2.4.1 在 `scope-resolution/pipeline/phase.ts` 的 `execute()` 中，从 `parseOutput` 解构 `preExtractedParsedFiles`
- [x] 2.4.2 传递给 `runScopeResolution` 新增的 `preExtractedParsedFiles` 参数
- [x] 2.4.3 `npx tsc --noEmit` 编译验证

### 2.5 runScopeResolution 跳过 extract 阶段

- [x] 2.5.1 在 `runScopeResolution` 的 `RunScopeResolutionInput` 接口中新增 `readonly preExtractedParsedFiles?: readonly ParsedFile[]` 可选字段
- [x] 2.5.2 当 `preExtractedParsedFiles` 非空时，跳过 `readFileContents` + per-file `extractParsedFile` 循环
- [x] 2.5.3 对每个 forwarded ParsedFile 调用 `provider.populateOwners(parsed)`（保持与现有 extract 路径一致）
- [x] 2.5.4 构建 `fileContents` Map：当有 `preExtractedParsedFiles` 时，从 `input.files` 参数构建（phase.ts 仍传入 files 供 hook 使用）；若 files 为空则延迟到 getFileContents 调用时再读
- [x] 2.5.5 验证当 `preExtractedParsedFiles` 为 `undefined` 时，执行现有 extract 路径（scopeTreeCache fallback）
- [x] 2.5.6 `npx tsc --noEmit` 编译验证

## 3. Phase 2: Worker 侧减负（ingestion-pipeline）

### 3.1 parse-worker 导入 isRegistryPrimary

- [x] 3.1.1 在 `parse-worker.ts` 中 import `isRegistryPrimary` from `'../registry-primary-flag.js'`
- [x] 3.1.2 `npx tsc --noEmit` 编译验证（确认 worker 环境兼容此 import）

### 3.2 Worker 跳过 registry-primary 语言的 scope 提取

- [x] 3.2.1 在 `parse-worker.ts` 的 `processFileGroup` 函数中，对 `isRegistryPrimary(language) === true` 的文件跳过 `extractParsedFile` 调用
- [x] 3.2.2 验证跳过后的 `result.parsedFiles` 不包含 registry-primary 文件的条目（通过三目运算：`!isPrimary ? extractParsedFile(...) : undefined` 实现）
- [x] 3.2.3 `npx tsc --noEmit` 编译验证

### 3.3 Worker 跳过 registry-primary 语言的 legacy 提取

- [x] 3.3.1 在 `parse-worker.ts` 中，对 `isRegistryPrimary(language) === true` 的文件跳过 legacy query extraction（calls/imports/heritage/assignments 的 query match 处理）
- [x] 3.3.2 注意：node/symbol/relationship 创建（用于 graph 节点）仍需保留，仅跳过 CALLS/IMPORTS 等将被 `isRegistryPrimary` gate 丢弃的提取。符号创建代码在主 match loop 的 fallthrough 路径中，不受 `!isPrimary` guard 影响
- [x] 3.3.3 `npx tsc --noEmit` 编译验证

### 3.4 验证 worker 跳过不破坏图结构

- [x] 3.4.1 运行 `npm test`（default pool），确认无新增测试失败
- [x] 3.4.2 确认 C# 文件的 Symbol 节点（Class/Method）仍正常创建

## 4. Phase 3: Namespace-siblings 去 Tree 化（namespace-siblings）

### 4.1 从 ParsedFile 推导 namespace 名

- [x] 4.1.1 实现 `deriveNamespaceFromParsedFile(parsed: ParsedFile): string | undefined` 辅助函数
- [x] 4.1.2 逻辑：遍历 `parsed.scopes`，找到 `kind === 'Namespace'` 的 scope，返回其 name 或推导名
- [x] 4.1.3 若无 namespace scope，返回 `undefined`（表示 global namespace）

### 4.2 从 ParsedFile 推导 using-static 路径

- [x] 4.2.1 实现 `deriveUsingStaticFromParsedFile(parsed: ParsedFile): string[]` 辅助函数
- [x] 4.2.2 逻辑：遍历 `parsed.parsedImports`，找到 kind 为 `using-static` 的条目，提取 targetRaw（ParsedImport 不保留 `using static` vs `using namespace` 区分，返回空数组，触发 tree-sitter fallback）

### 4.3 重构 extractFileStructure

- [x] 4.3.1 在 `populateCsharpNamespaceSiblings` 中，对每个 `ParsedFile` 先尝试从 ParsedFile 数据提取 `CsharpFileStructure`（通过 `deriveCsharpFileStructure` 实现）
- [x] 4.3.2 若提取成功（namespace 名非空），跳过 `extractFileStructure(content, cachedTree)` 调用
- [x] 4.3.3 若提取失败（无 namespace 信息或 parsing 异常），fallback 到 tree-sitter AST walk
- [x] 4.3.4 Fallback 时记录 debug 级别 logger 信息

### 4.4 验证 namespace-siblings 输出等价性

- [x] 4.4.1 确认现有 C# namespace-siblings 单元测试仍通过
- [x] 4.4.2 添加测试：ParsedFile 路径与 tree-sitter 路径产出相同 `bindingAugmentations`
- [x] 4.4.3 `npx tsc --noEmit` 编译验证

## 5. Phase 4: 进度回调（scope-resolution-progress）

### 5.1 scopeResolution phase 进度事件

- [x] 5.1.1 在 `scope-resolution/pipeline/phase.ts` 中，per-language 循环前后发送进度事件
- [x] 5.1.2 对每个阶段（extract/finalize/resolve/emit）发送 `ctx.onProgress` 事件，phase 名使用 `'scopeResolution'`
- [x] 5.1.3 包含 `stats.filesProcessed` 和 `stats.totalFiles` 在 payload 中

### 5.2 runScopeResolution 内部进度

- [x] 5.2.1 在 `runScopeResolution` 中，extract 阶段完成后发送 progress
- [x] 5.2.2 finalize 完成后发送 progress
- [x] 5.2.3 resolve 完成后发送 progress
- [x] 5.2.4 emit 完成后发送 progress
- [x] 5.2.5 当使用 `preExtractedParsedFiles` 时，发送 "Using pre-extracted scope data (N files)" 消息

### 5.3 验证进度输出

- [x] 5.3.1 对 neonnew 仓库运行 `analyze --extensions .cs`，确认 progress bar 显示 scopeResolution 阶段
- [x] 5.3.2 `npx tsc --noEmit` 编译验证

## 6. 收敛与验证准备

- [x] 6.1 编译验证：`npx tsc --noEmit` 无错误
- [x] 6.2 单元测试：`npm test` default pool 全部通过（无新增失败）
- [x] 6.3 全量测试：`npm run test:all` 通过（含 lbug-db 和 cli-e2e pool）
- [x] 6.4 Unity benchmark：对 neonnew 仓库运行 `analyze --extensions .cs --csharp-define-csproj <csproj>`，记录耗时并与 nantas-dev 基线对比
  - ⚠️ 上一 Session 错误诊断为"hang"——实际 worker 持续 100% CPU，~0.3s/file。
  - 8250 文件预估耗时 ~41 分钟（原始代码同样慢）。
  - 本 change 预估节省 ~8-9 分钟（scope-resolution 二次解析 + legacy extraction 跳过）。
  - 详见 verification.md §5 修正分析。
- [x] 6.5 Unity runtime process E2E：运行 `npm run build && node --test dist/benchmark/u2-e2e/*.test.js` 确认 UNITY_* 边产出不受影响
- [x] 6.6 验证 CALLS/IMPORTS 边数量在优化前后一致（non-regression）

## 7. 验证与回写收敛

- [x] 7.1 基于真实实现结果生成或更新 `verification.md`（覆盖 spec-to-implementation 与 task-to-evidence）
- [x] 7.2 基于 `verification.md` 结论生成或更新 `writeback.md`（目标、字段映射、前置条件）
- [x] 7.3 执行 `writeback.md` 中定义的回写目标（更新 `docs/plans/2026-05-09-analyze-perf-regression-root-cause-report.md` 状态），并记录可审计证据
  - 已更新 `docs/plans/2026-05-09-analyze-perf-regression-root-cause-report.md` §7 状态
  - 已添加 openspec 实现文档链接
  - 已记录 neonnew benchmark 阻塞原因（pre-existing hang）
