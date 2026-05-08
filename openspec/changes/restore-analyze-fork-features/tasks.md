# Tasks

## 1. Spec 覆盖确认

- [ ] 1.1 确认 `scoped-analyze` spec 覆盖 `--scope`/`--name`/`--reuse-options` 全部场景
- [ ] 1.2 确认 `csharp-define-csproj` spec 覆盖 CLI option → pipeline 桥接链路
- [ ] 1.3 确认 `analyze-diagnostics` spec 定义 `DiagnosticsContext` 接口和 `formatDiagnosticsSummary()` 行为
- [ ] 1.4 确认 `analyze-close-policy` spec 定义 force exit 的触发条件
- [ ] 1.5 确认 `analyze-cli` spec 覆盖 `AnalyzeOptions`/`AnalyzeResult` 扩展

---

## 2. 核心实现任务

### 2A: Options Bridge（覆盖 spec: `analyze-cli`）

- [ ] 2A.1 在 `run-analyze.ts` 的 `AnalyzeOptions` 接口中新增 `scopeRules?: string[]` 和 `csharpDefineCsproj?: string`
- [ ] 2A.2 在 `runFullAnalysis` 中将 `options.scopeRules` 转发到 `PipelineRunOptions.scopeRules`
- [ ] 2A.3 在 `runFullAnalysis` 中将 `options.csharpDefineCsproj` 转发到 `PipelineRunOptions.csharpDefineCsproj`
- [ ] 2A.4 验证: `npx tsc --noEmit` 确认 `AnalyzeOptions` 扩展不破坏现有调用方

### 2B: CLI Option Wiring（覆盖 spec: `scoped-analyze`, `csharp-define-csproj`）

- [ ] 2B.1 在 `analyze.ts` commander 定义中添加 `--scope <path>` option（支持多次调用）
- [ ] 2B.2 在 `analyze.ts` commander 定义中添加 `--name <alias>` option（增强 upstream 已有基础 name）
- [ ] 2B.3 在 `analyze.ts` commander 定义中添加 `--reuse-options` option
- [ ] 2B.4 在 `analyze.ts` commander 定义中添加 `--csharp-define-csproj <path>` option
- [ ] 2B.5 在 option resolution 阶段调用 `resolveEffectiveAnalyzeOptions()` 合并 CLI flags 与 stored options
- [ ] 2B.6 将 resolved options 映射到 `AnalyzeOptions` 并传入 `runFullAnalysis`
- [ ] 2B.7 验证: `gitnexus analyze --help` 显示所有新选项
- [ ] 2B.8 验证: `npx tsc --noEmit` 零新增错误

### 2C: Unified Diagnostics（覆盖 spec: `analyze-diagnostics`）

- [ ] 2C.1 创建 `gitnexus/src/cli/analyze-diagnostics.ts`，定义 `DiagnosticsContext` 接口
- [ ] 2C.2 实现 `formatDiagnosticsSummary(ctx)` 函数：整合 C# preproc / Unity / Unity rule binding / fallback 格式化
- [ ] 2C.3 在 `run-analyze.ts` 的 `AnalyzeResult` 中新增 `diagnostics?: DiagnosticsContext`
- [ ] 2C.4 在 `runFullAnalysis` 成功路径中从 `pipelineResult` 提取诊断数据填入 `DiagnosticsContext`
- [ ] 2C.5 在 `analyze.ts` 的 Summary 段调用 `formatDiagnosticsSummary(result.diagnostics)` 输出
- [ ] 2C.6 验证: `npx tsc --noEmit` `analyze-diagnostics.ts` 零错误
- [ ] 2C.7 验证: 无诊断数据时 `formatDiagnosticsSummary` 返回空数组，不影响现有输出

### 2D: Close Policy（覆盖 spec: `analyze-close-policy`）

- [ ] 2D.1 在 `analyze.ts` success path 末尾（summary 输出之后）加入 `process.exit(0)` 及注释
- [ ] 2D.2 确认 `runFullAnalysis` 不调用 `process.exit()`（供 server worker 安全使用）
- [ ] 2D.3 验证: `npx tsc --noEmit` 确认 analyze.ts 编译通过

### 2E: Import Cleanup

- [ ] 2E.1 确认 `analyze.ts` 正确导入 `analyze-options.ts`（`resolveEffectiveAnalyzeOptions`）
- [ ] 2E.2 确认 `analyze.ts` 正确导入 `analyze-diagnostics.ts`（`formatDiagnosticsSummary`）
- [ ] 2E.3 移除 analyze.ts 中不再需要的 fork 专用 import（如有）

---

## 3. 收敛与验证准备

- [ ] 3.1 运行 `npx tsc --noEmit` 确认全局零新增错误
- [ ] 3.2 运行 `gitnexus analyze --help` 确认所有选项正常显示
- [ ] 3.3 运行 `npm test -- --run` 确认无回归
- [ ] 3.4 汇总实现过程中与 design.md 的偏差项

---

## 4. 验证与回写收敛

- [ ] 4.1 基于实现结果生成 verification.md（覆盖 spec-to-implementation 映射与 task-to-evidence）
- [ ] 4.2 基于 verification.md 结论生成 writeback.md
- [ ] 4.3 执行 writeback：更新 `AGENTS.md` 维护规则（如有变更）、`gitnexus/README.md` 能力表格（如有变更）、`merge-upstream-2026-05/verification.md` 偏差记录
