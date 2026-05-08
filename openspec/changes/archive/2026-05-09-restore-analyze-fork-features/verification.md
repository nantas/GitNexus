# Verification

## 验证结论

| 验证维度 | 状态 | 说明 |
|----------|------|------|
| 编译通过（`npx tsc --noEmit`） | ✅ 通过 | 全局零新增错误 |
| CLI help（`gitnexus analyze --help`） | ✅ 通过 | `--name`、`--scope`、`--csharp-define-csproj`、`--reuse-options` 均正常显示 |
| 相关单元测试 | ✅ 通过 | `test/unit/analyze-diagnostics.test.ts`、`test/unit/analyze-options-bridge.test.ts`、`test/unit/analyze-embeddings-limit.test.ts`、`test/unit/analyze-worker-timeout.test.ts` 全部通过 |
| 全量测试（`npm test -- --run`） | ⚠️ 部分失败 | 失败均为预存在问题（native module segfault、tree-sitter 二进制缺失、bridge-db 等），与本 change 无关 |

## Spec-to-Implementation Coverage

### New Capabilities

| Capability | Spec 路径 | 实现文件 | 验证方式 |
|------------|-----------|---------|---------|
| `scoped-analyze` | `specs/scoped-analyze/spec.md` | `gitnexus/src/cli/index.ts`（`--scope`、`--name`、`--no-reuse-options`）<br>`gitnexus/src/cli/analyze.ts`（option resolution + 传给 `runFullAnalysis`）<br>`gitnexus/src/cli/analyze-options.ts`（`resolveEffectiveAnalyzeOptions`） | `--help` 显示；`npx tsc --noEmit` 通过；单元测试通过 |
| `csharp-define-csproj` | `specs/csharp-define-csproj/spec.md` | `gitnexus/src/cli/index.ts`（`--csharp-define-csproj`）<br>`gitnexus/src/core/run-analyze.ts`（`AnalyzeOptions.csharpDefineCsproj` → `PipelineRunOptions`）<br>`gitnexus/src/cli/analyze.ts`（CLI 路径存在性校验） | `--help` 显示；类型桥接通过；缺失文件报错验证通过 |
| `analyze-diagnostics` | `specs/analyze-diagnostics/spec.md` | `gitnexus/src/cli/analyze-diagnostics.ts`（`DiagnosticsContext` + `formatDiagnosticsSummary`）<br>`gitnexus/src/core/run-analyze.ts`（`AnalyzeResult.diagnostics` + 从 `pipelineResult`/`lbugResult` 提取）<br>`gitnexus/src/cli/analyze.ts`（Summary 段输出） | `npx tsc --noEmit` 通过；空数据返回 `[]` 已验证；fallback stats 已填充 |
| `analyze-close-policy` | `specs/analyze-close-policy/spec.md` | `gitnexus/src/cli/analyze.ts`（success path 末尾 `process.exit(0)` + 注释） | 代码审查确认；`runFullAnalysis` 不调用 `process.exit()` |

### Modified Capabilities

| Capability | Spec 路径 | 实现文件 | 验证方式 |
|------------|-----------|---------|---------|
| `analyze-cli` | `specs/analyze-cli/spec.md` | `gitnexus/src/core/run-analyze.ts`（`AnalyzeOptions` 新增 `scopeRules`、`csharpDefineCsproj`；`AnalyzeResult` 新增 `diagnostics`）<br>`gitnexus/src/cli/analyze.ts`（CLI flags 映射到 `AnalyzeOptions`） | `npx tsc --noEmit` 通过；现有调用方未破坏 |

## Task-to-Evidence Coverage

| 任务 ID | 任务描述 | 证据 |
|---------|---------|------|
| 2A.1 | `AnalyzeOptions` 新增 `scopeRules` / `csharpDefineCsproj` | `gitnexus/src/core/run-analyze.ts` 第 75-79 行 |
| 2A.2-2A.3 | 转发到 `PipelineRunOptions` | `gitnexus/src/core/run-analyze.ts` 第 219-226 行 |
| 2B.1-2B.4 | CLI option 注册 | `gitnexus/src/cli/index.ts` 第 33-41 行 |
| 2B.5-2B.6 | option resolution + 传给 `runFullAnalysis` | `gitnexus/src/cli/analyze.ts` 第 336-348、444-456 行 |
| 2C.1-2C.2 | `analyze-diagnostics.ts` | 新建文件 `gitnexus/src/cli/analyze-diagnostics.ts` |
| 2C.3-2C.4 | `AnalyzeResult.diagnostics` + 提取 | `gitnexus/src/core/run-analyze.ts` 第 100-101、562-571 行 |
| 2C.5 | Summary 输出 | `gitnexus/src/cli/analyze.ts` 第 578-584 行 |
| 2D.1 | `process.exit(0)` | `gitnexus/src/cli/analyze.ts` 第 708-712 行（upstream 已存在，无需修改） |
| 2E.1-2E.2 | import 确认 | `gitnexus/src/cli/analyze.ts` 第 19-22 行 |

## 验证后修复记录（Post-verification fixes）

| 问题 | 严重程度 | 修复文件 | 修复说明 |
|------|---------|---------|---------|
| CLI 提供的 csproj 路径缺少文件存在性检查 | WARNING | `gitnexus/src/cli/analyze.ts` | 在 option resolution 后增加 `fs.stat` 校验；缺失时输出 `cliError('Failed to read C# csproj: ...')` 并 exit 1 |
| scope 无匹配文件时无用户提示 | WARNING | `gitnexus/src/cli/analyze.ts` | 在 summary 输出前检查 `effective.scopeRules.length > 0 && result.stats.files === 0`，输出 `"No files found in scope"` 并 exit 0 |
| `fallbackWarnings`/`fallbackStats` 未填充 | WARNING | `gitnexus/src/core/lbug/lbug-adapter.ts`<br>`gitnexus/src/core/run-analyze.ts` | 扩展 `fallbackRelationshipInserts` 返回 `{succeeded, failed}`；`loadGraphToLbug` 返回 `fallbackInsertStats`；`runFullAnalysis` 捕获并填入 `DiagnosticsContext` |
| `normalizeRepoAlias` 错误信息不友好 | SUGGESTION | `gitnexus/src/cli/analyze.ts` | 在 `resolveEffectiveAnalyzeOptions` 调用处包装 try/catch，将 alias 验证错误转为 `cliError` 而非抛出堆栈 |
| 缺少恢复功能测试 | SUGGESTION | `gitnexus/test/unit/analyze-diagnostics.test.ts`<br>`gitnexus/test/unit/analyze-options-bridge.test.ts` | 新增 vitest 测试覆盖 `formatDiagnosticsSummary` 和 `resolveEffectiveAnalyzeOptions` |
| 废弃测试文件未清理 | SUGGESTION | 删除 `gitnexus/src/cli/analyze-multi-scope-regression.test.ts` | 该文件使用 `node:test`、位于 `src/cli/`（不在 vitest include 范围内）、依赖缺失 fixture |
| `formatUnityRuleBindingSummary` 空数据返回非空 | SUGGESTION | `gitnexus/src/cli/analyze-summary.ts` | 当 `diagnostics.summary.length === 0 && diagnostics.anomalies.length === 0` 时返回 `[]`，符合 spec 场景 |

## 与 design.md 的偏差项

| 偏差 | 原因 | 影响 |
|------|------|------|
| `PipelineResult.unityRuleBindingResult` 类型定义与 `UnityRuntimeBindingResult` 不匹配 | `types/pipeline.ts` 中该字段被定义为简单对象，而实际运行时值和 `formatUnityRuleBindingSummary` 期望的是 `UnityRuntimeBindingResult` | 已修复：更新 `types/pipeline.ts` 中该字段类型为 `UnityRuntimeBindingResult` |
| `analyze-pipeline-options.test.ts` 测试文件失效 | 该测试依赖的 `buildPipelineRunOptionsForAnalyze` 函数在 upstream 中已移除 | 已删除该废弃测试文件 |
| `test/unit/analyze-embeddings-limit.test.ts` 与 `test/unit/analyze-worker-timeout.test.ts` 需要补充 `loadMeta` mock | `analyze.ts` 新增了 `loadMeta` 导入以支持 option resolution | 已在两个测试文件的 mock 中补充 `loadMeta` |

## 遗留阻塞项

- 无本 change 引入的阻塞项。
- 预存在 native module segfault（LadybugDB/ONNX）导致部分 integration 测试在本地无法运行，不影响本次恢复功能。
