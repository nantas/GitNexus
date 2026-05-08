# Specification Delta

## Capability 对齐（已确认）

- Capability: `analyze-csproj-persistence`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: 用户确认 `--csharp-define-csproj` 应持久化到 meta.json.analyzeOptions

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: csproj-option-persistence
The `csharpDefineCsproj` option SHALL be persisted to `meta.json.analyzeOptions` after a successful analyze run, alongside the existing fields (`includeExtensions`, `scopeRules`, `repoAlias`, `embeddings`).

#### Scenario: csproj-written-to-meta-json
- **GIVEN** the user runs `analyze --csharp-define-csproj /path/to/Assembly-CSharp.csproj`
- **WHEN** the analyze completes successfully
- **THEN** `meta.json.analyzeOptions.csharpDefineCsproj` SHALL equal `/path/to/Assembly-CSharp.csproj`

#### Scenario: csproj-reused-from-meta-json
- **GIVEN** `meta.json.analyzeOptions` contains `{ csharpDefineCsproj: '/path/to/Assembly-CSharp.csproj' }`
- **AND** the file at that path exists on disk
- **WHEN** the user runs `analyze` without `--csharp-define-csproj`
- **THEN** the system SHALL reuse the stored path for C# preprocessor normalization

#### Scenario: csproj-not-reused-when-file-missing
- **GIVEN** `meta.json.analyzeOptions` contains `{ csharpDefineCsproj: '/deleted/file.csproj' }`
- **AND** the file does not exist on disk
- **WHEN** the user runs `analyze` without `--csharp-define-csproj`
- **THEN** the system SHALL output a warning about the missing file
- **AND** `csharpDefineCsproj` SHALL be `undefined` (no preprocessor normalization)

#### Scenario: csproj-cli-override-stored
- **GIVEN** `meta.json.analyzeOptions` contains `{ csharpDefineCsproj: '/old/path.csproj' }`
- **WHEN** the user runs `analyze --csharp-define-csproj /new/path.csproj`
- **THEN** the CLI value `/new/path.csproj` SHALL be used
- **AND** after completion, `meta.json.analyzeOptions.csharpDefineCsproj` SHALL be updated to `/new/path.csproj`

#### Scenario: no-csproj-stored-and-no-cli
- **GIVEN** `meta.json.analyzeOptions` does not contain `csharpDefineCsproj`
- **WHEN** the user runs `analyze` without `--csharp-define-csproj`
- **THEN** no C# preprocessor normalization SHALL occur
- **AND** `meta.json.analyzeOptions.csharpDefineCsproj` SHALL remain absent
