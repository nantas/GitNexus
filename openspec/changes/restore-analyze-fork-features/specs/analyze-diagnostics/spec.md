# Specification Delta

## Capability 对齐（已确认）

- Capability: `analyze-diagnostics`
- 来源: `proposal.md` / New Capabilities
- 变更类型: `new`
- 用户确认摘要: 全选确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## ADDED Requirements

### Requirement: Unified Diagnostics Output
The system SHALL provide a single `formatDiagnosticsSummary()` function that consolidates all fork-specific diagnostic output into a structured summary. The function SHALL accept a `DiagnosticsContext` containing pipeline runtime information and return an array of formatted strings ready for console output.

#### Scenario: All diagnostics present
- **WHEN** the pipeline produces Unity rule binding results, C# preproc diagnostics, and fallback edge warnings
- **THEN** `formatDiagnosticsSummary()` SHALL return lines covering all three categories in order: C# preproc, Unity, fallback

#### Scenario: No diagnostics data
- **WHEN** none of the diagnostic data sources are present (e.g., non-Unity, non-C# project)
- **THEN** `formatDiagnosticsSummary()` SHALL return an empty array
- **AND** no diagnostic output SHALL appear in the analyze summary

### Requirement: CSharp Preproc Diagnostics
The system SHALL report C# preprocessor normalization statistics when `--csharp-define-csproj` is active. The output SHALL include: define symbol count, normalized file count, fallback file count, skipped file count, expression error count, and a preview of undefined symbols.

#### Scenario: C# preproc active with results
- **WHEN** `--csharp-define-csproj` is used and the pipeline normalizes C# files
- **THEN** the summary SHALL include: `CSharp Preproc: defines=N, normalized=N, fallback=N, skipped=N, exprErrors=N`
- **AND** a line showing the csproj source path
- **AND** up to 5 undefined symbol names as a preview

#### Scenario: C# preproc with many undefined symbols
- **WHEN** there are 20 undefined symbols
- **THEN** the output SHALL preview the first 5
- **AND** append `... 15 more`

#### Scenario: C# preproc not enabled
- **WHEN** `--csharp-define-csproj` is NOT specified
- **THEN** no C# preproc diagnostic lines SHALL appear

### Requirement: Unity Diagnostics
The system SHALL report Unity runtime binding diagnostics when Unity resource processing is active. The output SHALL include: diagnostic message count, anomaly count, and a preview of anomalies.

#### Scenario: Unity bindings with anomalies
- **WHEN** Unity rule binding produces 3 anomalies
- **THEN** the summary SHALL include: `Unity Rule Binding Diagnostics:` header
- **AND** show each non-anomaly summary message
- **AND** show `rule_binding.anomalies: count=3`
- **AND** preview up to 3 anomaly messages

#### Scenario: Unity bindings with no issues
- **WHEN** Unity rule binding produces no diagnostics and no anomalies
- **THEN** the `formatUnityRuleBindingSummary` SHALL return an empty array

### Requirement: Fallback Edge Summary
The system SHALL report fallback relationship insertion statistics when the LbugDB CSV import encounters schema-rejected edges. The output SHALL include attempted, succeeded, and failed counts, plus a preview of warning messages.

#### Scenario: Fallback edges inserted
- **WHEN** `loadGraphToLbug` reports `fallbackInsertStats: { attempted: 50, succeeded: 45, failed: 5 }`
- **THEN** the summary SHALL include: `Fallback edges: attempted=50, succeeded=45, failed=5, pairTypes=N`
- **AND** preview up to 5 warning messages

#### Scenario: No fallback edges
- **WHEN** `fallbackInsertStats.attempted === 0` and `warnings` is empty
- **THEN** no fallback summary lines SHALL appear

### Requirement: Diagnostics Interface Type
The system SHALL define a `DiagnosticsContext` interface as the single input to `formatDiagnosticsSummary()`:

```typescript
interface DiagnosticsContext {
  csharpPreproc?: CSharpPreprocDiagnostics;
  unityBinding?: UnityRuntimeBindingResult;
  fallbackWarnings?: string[];
  fallbackStats?: FallbackInsertStats;
}
```

#### Scenario: Type-safe diagnostics call
- **WHEN** `analyze.ts` calls `formatDiagnosticsSummary({ csharpPreproc, unityBinding, fallbackWarnings, fallbackStats })`
- **THEN** the call SHALL compile without type errors
- **AND** the return value SHALL be `string[]`
