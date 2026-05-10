# Proposal

## 问题定义

`chore/merge-upstream-2026-05` 合并后，对 Unity C# 项目的 `analyze --extensions .cs` 构建耗时从 nantas-dev 的 ~130s 退化至 ~15min（~7x）。根因分析报告已定位并修复 `--extensions` 参数断裂和 Unity scan 激活门问题，但 **scope-resolution phase 对全部 C# 文件执行二次 tree-sitter 解析** 是剩余的最大性能瓶颈。

核心链路缺陷：
1. **Worker-produced ParsedFile 被丢弃**：parse worker 在每个 C# 文件上调用 `extractParsedFile` → `emitCsharpScopeCaptures`，产出 `ParsedFile` 并通过 IPC 发送至主线程，但 `parse-impl.ts` 完全忽略 `chunkWorkerData.parsedFiles`。
2. **scopeResolution 无条件重新提取**：`scopeResolutionPhase` 重新读取全部文件内容、重新 tree-sitter 解析、重新执行 `emitCsharpScopeCaptures`。`scopeTreeCache` 在 worker 路径下为空（Trees 无法跨越 MessageChannel），缓存命中率为零。
3. **namespace-siblings 第三次 parse**：`populateCsharpNamespaceSiblings` 再次通过 tree-sitter AST walk 提取 namespace 信息，在 `scopeTreeCache` 为空时触发第三次解析。
4. **Worker 侧冗余工作**：parse worker 对 registry-primary 语言（C#）执行的 legacy 提取（calls/imports/heritage）全部被 `isRegistryPrimary` gate 跳过，纯属浪费。

## 范围边界

**In scope:**
- `parse-impl.ts`：转发 worker 产出的 `ParsedFile[]` 至 `ParseOutput`
- `scope-resolution/pipeline/phase.ts`：接收预提取的 `ParsedFile[]`，传递给 `runScopeResolution`
- `scope-resolution/pipeline/run.ts`：新增 `preExtractedParsedFiles` 路径，跳过 extract 阶段
- `parsing-processor.ts` / `parse-worker.ts`：对 registry-primary 语言跳过 worker 侧 scope 提取和 legacy 提取
- `languages/csharp/namespace-siblings.ts`：从 `ParsedFile` 数据提取 namespace 信息，消除 tree-sitter 依赖
- `scope-resolution/pipeline/phase.ts`：添加进度回调，消除"卡住"无反馈

**Out of scope:**
- `ParsedFile` 类型定义修改（`gitnexus-shared`）
- `finalizeScopeModel` / `resolveReferenceSites` 算法优化（上游 shared 包）
- 合并 parse phase 与 scope-resolution phase 为单一 phase（架构大改）
- 非 C# 语言的 scope-resolution 路径
- Unity 功能变更（`unityScanPhase` / `unityEnrichPhase` / `applyUnityLifecycleSyntheticCalls`）

## Capabilities

### New Capabilities

- `parse-scope-bridge`: Parse worker 产出的 `ParsedFile` 通过 `ParseOutput` 透传至 scope-resolution phase，消除二次 tree-sitter 解析
- `scope-resolution-progress`: scope-resolution phase 提供 per-file 进度回调，与 pipeline progress bar 集成

### Modified Capabilities

- `ingestion-pipeline`: parse phase 的 `ParseOutput` 新增 `preExtractedParsedFiles` 字段；scope-resolution phase 优先使用预提取数据；parse worker 对 registry-primary 语言跳过冗余提取
- `namespace-siblings`: C# namespace-siblings 从 `ParsedFile.parsedImports` 提取 namespace 信息，不再依赖 tree-sitter AST walk

## Capabilities 待确认项

- [x] 能力清单已与上下文分析对齐（来自 `docs/plans/2026-05-09-analyze-perf-regression-root-cause-report.md` 和子 agent 深度探索）

## Impact

- **性能**：消除 scopeResolution 中的 tree-sitter re-parse × 8192 文件 + readFileContents I/O + worker 侧冗余提取，预估节省 65-100s
- **内存**：消除 scopeResolution 中的 `readFileContents`（~18MB 峰值）和重复 Tree 对象分配
- **Unity**：无影响——`unityScanPhase` 在 `scopeResolutionPhase` 之后执行，`applyUnityLifecycleSyntheticCalls` 消费相同的 CALLS 边
- **向后兼容**：`ParseOutput.preExtractedParsedFiles` 为可选字段，sequential path 和 worker path 均兼容
- **风险**：`ParsedFile` 跨 IPC 序列化已验证（当前 worker 已在序列化并通过 `postMessage` 发送）；唯一边际风险为 worker Tree 与主线程 re-parse Tree 的等价性——相同 source + 相同 parser，应产出一致结果

## 关联绑定

- 关联 binding: `binding.md`
- 已确认标准页 / 项目页 / 回写目标：`repo://gitnexus` / `openspec/changes/perf-scope-resolution-bridge/` / 根因报告状态更新
