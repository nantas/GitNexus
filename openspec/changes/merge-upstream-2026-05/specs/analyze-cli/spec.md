# Specification Delta

## Capability 对齐（已确认）

- Capability: `analyze-cli`
- 来源: `proposal.md` / Modified Capabilities
- 变更类型: `modified`
- 用户确认摘要: 全选进行

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: Scoped Analyze
The system SHALL support scoped analyze via `--scope <path>` and `--name <alias>`, restricting analysis to a subset of the repository. The `--reuse-options` flag SHALL persist scope and alias settings across runs.

#### Scenario: Scoped analyze with alias
- **WHEN** `gitnexus analyze --scope Assets/Scripts --name core-scripts` is run
- **THEN** only files under `Assets/Scripts` SHALL be analyzed and the result SHALL be registered as `core-scripts`

### Requirement: Analyze Options Resolution
The system SHALL resolve analyze options in priority order: CLI flags > stored options (meta.json) > defaults. Stored options SHALL be validated on load and discarded if the referenced paths no longer exist.

#### Scenario: Stored options reuse
- **WHEN** `gitnexus analyze` is run without flags on a previously scoped repo
- **THEN** the stored scope and alias SHALL be reused from `meta.json.analyzeOptions`

### Requirement: C# Preprocessor Integration
The system SHALL support `--csharp-define-csproj <path>` to enable C# conditional compilation preprocessing. The path SHALL be persisted to `meta.json` on first successful use and auto-detected on subsequent runs.

#### Scenario: C# csproj persistence
- **WHEN** `gitnexus analyze --csharp-define-csproj Assembly-CSharp.csproj` completes successfully
- **THEN** the csproj path SHALL be stored in `meta.json.analyzeOptions` and reused on the next analyze

### Requirement: Embedding Integration
The system SHALL support `--embeddings[=<N>]` flag from upstream with optional count limit, preserving existing embeddings by default and requiring `--force` for regeneration.

#### Scenario: Embedding count limit
- **WHEN** `gitnexus analyze --embeddings=500` is run
- **THEN** at most 500 symbols SHALL be embedded

### Requirement: Runtime Summary
The system SHALL output a runtime summary after analyze completes, including timing breakdown, symbol counts, and any diagnostic warnings.

#### Scenario: Analyze completion summary
- **WHEN** an analyze run completes
- **THEN** a summary with phase timings and symbol counts SHALL be printed

### Requirement: Clean Preserve Config
The system SHALL support `gitnexus clean` that removes the `.gitnexus/` index directory but preserves `meta.json` and config files, enabling re-analysis without reconfiguring options.

#### Scenario: Clean with config preservation
- **WHEN** `gitnexus clean` is run on an indexed repo
- **THEN** `.gitnexus/meta.json` and `.gitnexus/rules/` SHALL be preserved while the index database is removed
