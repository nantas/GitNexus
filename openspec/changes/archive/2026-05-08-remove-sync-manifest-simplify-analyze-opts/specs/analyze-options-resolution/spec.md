# Specification Delta

## Capability 对齐（已确认）

- Capability: `analyze-options-resolution`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: 用户确认从三层优先级简化为两层（CLI > stored），移除 sync-manifest 文件依赖

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## REMOVED Requirements

### Requirement: sync-manifest-auto-load
**Reason**: sync-manifest 文件机制整体移除，不再有 auto-load `.gitnexus/sync-manifest.txt` 的行为
**Migration**: 用户首次 analyze 时通过 CLI 参数指定选项，之后自动持久化到 meta.json.analyzeOptions

### Requirement: sync-manifest-drift-guard
**Reason**: 不再存在 sync-manifest 与 CLI 参数的不一致问题
**Migration**: 移除 `--sync-manifest-policy` 参数，不再需要 drift guard

### Requirement: manifest-directive-precedence
**Reason**: 不再存在 manifest directive 中间层
**Migration**: 优先级简化为 CLI > stored

## MODIFIED Requirements

### Requirement: effective-options-resolution
The system SHALL resolve effective analyze options using exactly two layers of precedence:

1. **CLI layer**: If the user explicitly passed a CLI argument for a given option, that value SHALL be used.
2. **Stored layer**: If no CLI argument was provided for that option AND `reuseOptions !== false`, the system SHALL use the corresponding value from `meta.json.analyzeOptions` (after validation via `validateStoredOptions`).
3. **Default layer**: If no CLI argument AND (`reuseOptions === false` OR no stored value exists), the system SHALL use the default value (empty array, `undefined`, or `false`).

The resolution applies independently to each of these fields: `includeExtensions`, `scopeRules`, `repoAlias`, `embeddings`, `csharpDefineCsproj`.

#### Scenario: cli-override-wins-over-stored
- **GIVEN** `meta.json.analyzeOptions` contains `{ includeExtensions: ['.cs'], scopeRules: ['Assets/'] }`
- **WHEN** the user runs `analyze --extensions .ts`
- **THEN** `includeExtensions` SHALL be `['.ts']` (CLI value)
- **AND** `scopeRules` SHALL be `['Assets/']` (stored value, reused)

#### Scenario: reuse-false-ignores-stored
- **GIVEN** `meta.json.analyzeOptions` contains `{ includeExtensions: ['.cs'], repoAlias: 'my-repo' }`
- **WHEN** the user runs `analyze --no-reuse-options`
- **THEN** `includeExtensions` SHALL be `[]`
- **AND** `repoAlias` SHALL be `undefined`
- **AND** `embeddings` SHALL be `false`

#### Scenario: no-stored-uses-defaults
- **GIVEN** no `meta.json` exists for the repository
- **WHEN** the user runs `analyze` without any options
- **THEN** `includeExtensions` SHALL be `[]`
- **AND** `scopeRules` SHALL be `[]`
- **AND** `repoAlias` SHALL be `undefined`
- **AND** `embeddings` SHALL be `false`
- **AND** `csharpDefineCsproj` SHALL be `undefined`

#### Scenario: stored-validated-before-use
- **GIVEN** `meta.json.analyzeOptions` contains `{ repoAlias: 'invalid alias!' }`
- **WHEN** the user runs `analyze` without `--repo-alias`
- **THEN** the system SHALL call `validateStoredOptions`
- **AND** `repoAlias` SHALL be `undefined` (validation failed, fallback)
- **AND** a warning SHALL be output to the user
