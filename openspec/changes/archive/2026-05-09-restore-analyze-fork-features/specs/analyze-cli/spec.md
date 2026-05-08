# Specification Delta

## Capability 对齐（已确认）

- Capability: `analyze-cli`
- 来源: `proposal.md` / Modified Capabilities
- 变更类型: `modified`
- 用户确认摘要: 全选确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: AnalyzeOptions Interface Extension
The system SHALL extend the upstream `AnalyzeOptions` interface (in `run-analyze.ts`) with two additional optional fields: `scopeRules?: string[]` for scoped file discovery, and `csharpDefineCsproj?: string` for C# preprocessor define profile loading.

#### Scenario: AnalyzeOptions with scope rules
- **WHEN** `AnalyzeOptions` includes `scopeRules: ['src/core', 'src/cli']`
- **THEN** `runFullAnalysis` SHALL forward `scopeRules` to `PipelineRunOptions`
- **AND** the pipeline SHALL apply scope filtering during file discovery

#### Scenario: AnalyzeOptions without scope rules
- **WHEN** `AnalyzeOptions` has no `scopeRules` field (undefined)
- **THEN** `runFullAnalysis` SHALL pass `scopeRules: undefined` to the pipeline
- **AND** the pipeline SHALL discover all files (no scope filtering)

### Requirement: AnalyzeOptions csharpDefineCsproj Extension
The system SHALL extend `AnalyzeOptions` with `csharpDefineCsproj?: string`. When set, `runFullAnalysis` SHALL forward it to `PipelineRunOptions` so the pipeline can invoke `loadCSharpDefineProfileFromCsproj`.

#### Scenario: AnalyzeOptions with csproj
- **WHEN** `AnalyzeOptions` includes `csharpDefineCsproj: '/repo/Assembly-CSharp.csproj'`
- **THEN** `runFullAnalysis` SHALL set `PipelineRunOptions.csharpDefineCsproj` to the same value
- **AND** the pipeline SHALL load define symbols from the csproj

### Requirement: CLI Option Wiring
The system SHALL wire the new and restored CLI options (`--scope`, `--name`, `--reuse-options`, `--csharp-define-csproj`) from the commander program definition through to `AnalyzeOptions` and ultimately to `runFullAnalysis`.

#### Scenario: All new CLI options specified
- **WHEN** `gitnexus analyze --scope src --name my-lib --reuse-options --csharp-define-csproj MyProject.csproj` is run
- **THEN** all four options SHALL be present in the `AnalyzeOptions` passed to `runFullAnalysis`
- **AND** `runFullAnalysis` SHALL complete successfully with scope-filtered, csproj-enabled analysis

#### Scenario: No new CLI options specified
- **WHEN** `gitnexus analyze` is run with no fork-specific flags
- **THEN** the analyze SHALL behave identically to upstream (no scope filtering, no csproj)
- **AND** all upstream flags (`--embeddings`, `--force`, etc.) SHALL continue to work

### Requirement: runFullAnalysis Diagnostics Passthrough
The system SHALL extend `AnalyzeResult` with an optional `diagnostics` field containing the `DiagnosticsContext` for downstream consumption by the CLI summary output.

#### Scenario: Diagnostics available in result
- **WHEN** `runFullAnalysis` completes with Unity/C# preproc/fallback data
- **THEN** `AnalyzeResult.diagnostics` SHALL contain the `DiagnosticsContext`
- **AND** the CLI SHALL call `formatDiagnosticsSummary(result.diagnostics)` to produce summary output

#### Scenario: No diagnostics data
- **WHEN** `runFullAnalysis` completes without any diagnostics sources (non-Unity, no csproj)
- **THEN** `AnalyzeResult.diagnostics` SHALL be `undefined`
- **AND** `formatDiagnosticsSummary(undefined)` SHALL return an empty array
