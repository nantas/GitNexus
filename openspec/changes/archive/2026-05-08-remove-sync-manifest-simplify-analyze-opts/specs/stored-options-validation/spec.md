# Specification Delta

## Capability 对齐（已确认）

- Capability: `stored-options-validation`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `new`
- 用户确认摘要: 用户确认复用 meta.json.analyzeOptions 前需要校验字段合法性

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## ADDED Requirements

### Requirement: validate-stored-options-on-load
When `resolveEffectiveAnalyzeOptions` is about to use stored options from `meta.json.analyzeOptions`, the system SHALL validate each field before returning it.

#### Scenario: valid-stored-options-pass-validation
- **GIVEN** `meta.json.analyzeOptions` contains `{ includeExtensions: ['.cs', '.ts'], scopeRules: ['Assets/'], repoAlias: 'my-repo', csharpDefineCsproj: '/path/to/Assembly-CSharp.csproj', embeddings: true }`
- **AND** the file at `csharpDefineCsproj` exists on disk
- **WHEN** `validateStoredOptions` is called
- **THEN** all fields SHALL pass validation and be returned unchanged

#### Scenario: invalid-repo-alias-warns-and-falls-back
- **GIVEN** `meta.json.analyzeOptions` contains `{ repoAlias: 'bad alias!' }`
- **WHEN** `validateStoredOptions` is called
- **THEN** the system SHALL output a warning message containing the invalid value
- **AND** `repoAlias` SHALL be set to `undefined` in the returned options

#### Scenario: invalid-extension-format-warns-and-falls-back
- **GIVEN** `meta.json.analyzeOptions` contains `{ includeExtensions: ['cs', '.ts'] }`
- **WHEN** `validateStoredOptions` is called
- **THEN** the system SHALL output a warning for entries not starting with `.`
- **AND** invalid entries SHALL be filtered out; valid entries SHALL be preserved

#### Scenario: csproj-file-not-found-warns-and-falls-back
- **GIVEN** `meta.json.analyzeOptions` contains `{ csharpDefineCsproj: '/nonexistent/path.csproj' }`
- **AND** the file does not exist on disk
- **WHEN** `validateStoredOptions` is called
- **THEN** the system SHALL output a warning that the .csproj file was not found
- **AND** `csharpDefineCsproj` SHALL be set to `undefined` in the returned options

#### Scenario: empty-scope-rules-warns
- **GIVEN** `meta.json.analyzeOptions` contains `{ scopeRules: ['', '  '] }`
- **WHEN** `validateStoredOptions` is called
- **THEN** empty/whitespace-only entries SHALL be filtered out
- **AND** if no valid rules remain, `scopeRules` SHALL be set to `[]`
