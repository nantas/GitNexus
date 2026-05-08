# Design

## Context

`merge-upstream-2026-05` 第 4 批将 `analyze.ts` 替换为 upstream 版本，引入 `runFullAnalysis` 作为统一分析入口。upstream 的 `AnalyzeOptions` 接口目前包含 `force`、`embeddings`、`registryName` 等字段，但**不包含** scope filtering、csproj define、diagnostics 等 fork 所需的能力。

`runFullAnalysis` 内部调用 `runPipelineFromRepo`，而 `PipelineRunOptions` 接口（`types/pipeline.ts`）**已经**在 fork 版本中包含了 `scopeRules` 和 `csharpDefineCsproj` 字段。因此 options bridge 的关键是：将新字段从 `AnalyzeOptions` 传递到 `PipelineRunOptions`。

现有 fork 诊断代码分布在：
- `analyze-summary.ts`: 4 个独立的格式化函数（C# preproc / Unity / Unity rule binding / fallback）
- `analyze-runtime-summary.ts`: `toPipelineRuntimeSummary` 从 `PipelineResult` 提取摘要
- `exit-code.ts`: `resolveChildProcessExit` 处理退出码

本次重构将整合为统一的 `DiagnosticsContext` + `formatDiagnosticsSummary()`。

## Goals / Non-Goals

**Goals:**

- 在 upstream `analyze.ts` 上恢复 `--scope`、`--name`、`--reuse-options`、`--csharp-define-csproj` CLI 选项
- 扩展 `AnalyzeOptions`（`run-analyze.ts`）增加 `scopeRules` 和 `csharpDefineCsproj` 字段
- 桥接 `AnalyzeOptions` → `runFullAnalysis` → `PipelineRunOptions`
- 创建统一的 `DiagnosticsContext` 类型 + `formatDiagnosticsSummary()` 输出函数
- 扩展 `AnalyzeResult` 增加可选的 `diagnostics` 字段
- 恢复 `process.exit(0)` 到成功路径
- 零破坏 upstream 现有行为

**Non-Goals:**

- 不修改 `runFullAnalysis` 的核心分析逻辑
- 不修改 C# preproc 归一化管线本身
- 不修改 Unity runtime process 管线
- 不恢复 fork 的低层级 pipeline 直接调用
- 不实现 csproj 自动发现（保持显式指定）
- 不修改 `PipelineRunOptions` 接口（已包含所需字段）

## Decisions

### D1: Options Bridge 策略 — 最小字段扩展

**决策**: 在 `AnalyzeOptions`（`run-analyze.ts`）中仅新增两个可选字段：
- `scopeRules?: string[]`
- `csharpDefineCsproj?: string`

`runFullAnalysis` 内部将它们直接转发到 `PipelineRunOptions`（该接口已包含这两个字段）。

**理由**: upstream `PipelineRunOptions` 已由 fork 扩展，无需重复建模。可选字段保证向后兼容。

### D2: Diagnostics 组装位置 — runFullAnalysis 中收集，CLI 层格式化

**决策**: `runFullAnalysis` 在执行过程中收集 pipeline 的诊断数据，打包为 `DiagnosticsContext` 放入 `AnalyzeResult.diagnostics`。CLI 层调用 `formatDiagnosticsSummary()` 进行格式化输出。

**理由**: `runFullAnalysis` 是唯一能访问完整 `PipelineResult` 的位置；CLI 层只负责格式化。

### D3: formatDiagnosticsSummary 文件位置 — 新建 `analyze-diagnostics.ts`

**决策**: 创建 `gitnexus/src/cli/analyze-diagnostics.ts`，包含 `DiagnosticsContext` 接口和 `formatDiagnosticsSummary()` 函数。原 `analyze-summary.ts` 中的函数迁移后标记 deprecated。

### D4: Close Policy — analyze.ts 成功路径末尾

**决策**: 在 upstream `analyze.ts` 的 success path 末尾加入 `process.exit(0)`，附带注释。仅影响 CLI，不影响 `runFullAnalysis`（供 server worker 使用）。

### D5: --reuse-options — 复用 fork 的 analyze-options.ts

**决策**: 保留 `analyze-options.ts`，在 `analyze.ts` 的 option resolution 阶段调用 `resolveEffectiveAnalyzeOptions()` 合并 CLI flags 与 stored options。

## Risks / Migration

| 风险 | 缓解措施 |
|------|---------|
| `PipelineRunOptions` 的 `scopeRules` 字段可能被上游移除 | 使用可选字段，不存在时降级为全量分析 |
| `DiagnosticsContext` 依赖 fork 类型 | 这些类型已在 `types/pipeline.ts` 中定义，不会消失 |
| `formatDiagnosticsSummary` 空数据 | 返回空数组，调用方跳过输出 |
| `process.exit(0)` 在 server 模式下不应触发 | `runFullAnalysis` 不调用 `process.exit()`，只有 CLI 命令调用 |
| `--reuse-options` 依赖 meta.json 格式 | `validateStoredOptions` 防御性校验，无效值丢弃 |
