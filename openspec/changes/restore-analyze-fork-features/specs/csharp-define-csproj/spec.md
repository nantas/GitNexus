# Specification Delta

## Capability 对齐（已确认）

- Capability: `csharp-define-csproj`
- 来源: `proposal.md` / New Capabilities
- 变更类型: `new`
- 用户确认摘要: 全选确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## ADDED Requirements

### Requirement: C# Define Csproj CLI Option
The system SHALL support `--csharp-define-csproj <path>` to specify a `.csproj` file whose `<DefineConstants>` are extracted and injected into the C# preprocessing pipeline.

#### Scenario: Specify csproj for define extraction
- **WHEN** `gitnexus analyze --csharp-define-csproj Assembly-CSharp.csproj` is run on a Unity project
- **THEN** the system SHALL parse `<DefineConstants>` from the csproj
- **AND** inject the extracted symbols into the C# preproc normalizer (`normalizeCSharpPreprocessorBranches`)
- **AND** persist `csharpDefineCsproj` to `meta.json.analyzeOptions`

#### Scenario: Csproj file not found
- **WHEN** `--csharp-define-csproj missing.csproj` is specified and the file does not exist
- **THEN** the system SHALL emit a clear error: "Failed to read C# csproj: <path>"
- **AND** exit with code 1

#### Scenario: Csproj with no DefineConstants
- **WHEN** the specified csproj has no `<DefineConstants>` section
- **THEN** the system SHALL proceed without define symbols
- **AND** emit a diagnostic note: "No DefineConstants found in <path>"

#### Scenario: Analyze without --csharp-define-csproj
- **WHEN** `gitnexus analyze` is run without `--csharp-define-csproj` on a C# project
- **THEN** C# files SHALL be parsed without conditional compilation normalization
- **AND** `#if` / `#else` / `#endif` branches SHALL be treated as regular code

### Requirement: Pipeline Options Bridge
The system SHALL pass `csharpDefineCsproj` through the analyze pipeline: CLI → `AnalyzeOptions` → `runFullAnalysis` → `PipelineRunOptions` → `runPipelineFromRepo`.

#### Scenario: End-to-end csproj option flow
- **WHEN** `gitnexus analyze --csharp-define-csproj MyProject.csproj` is executed
- **THEN** `AnalyzeOptions.csharpDefineCsproj` SHALL be set to the resolved absolute path
- **AND** `runFullAnalysis` SHALL forward it to `PipelineRunOptions`
- **AND** `runPipelineFromRepo` SHALL invoke `loadCSharpDefineProfileFromCsproj` with the path
- **AND** the pipeline SHALL normalize C# files using the extracted define symbols

### Requirement: Csproj Path Resolution
The system SHALL resolve the csproj path relative to the repository root. The resolved absolute path SHALL be stored in `meta.json`.

#### Scenario: Relative csproj path
- **WHEN** `--csharp-define-csproj subdir/Project.csproj` is specified from repo root `/repo`
- **THEN** the resolved path SHALL be `/repo/subdir/Project.csproj`

#### Scenario: Reuse stored csproj option
- **WHEN** `meta.json.analyzeOptions.csharpDefineCsproj` stores a valid path
- **AND** `gitnexus analyze` is run without `--csharp-define-csproj`
- **AND** `--reuse-options` is enabled
- **THEN** the stored csproj path SHALL be validated (file existence check)
- **AND** if valid, it SHALL be reused; if invalid, it SHALL be discarded with a warning
