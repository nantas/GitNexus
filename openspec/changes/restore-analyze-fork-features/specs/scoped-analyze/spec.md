# Specification Delta

## Capability 对齐（已确认）

- Capability: `scoped-analyze`
- 来源: `proposal.md` / New Capabilities
- 变更类型: `new`
- 用户确认摘要: 全选确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## ADDED Requirements

### Requirement: Scoped Analyze via --scope
The system SHALL support `--scope <path>` to restrict file discovery and analysis to a subdirectory of the repository.

#### Scenario: Analyze single subdirectory
- **WHEN** `gitnexus analyze --scope Assets/Scripts` is run
- **THEN** only files under `Assets/Scripts` SHALL be discovered and analyzed
- **AND** the scope rule SHALL be persisted to `meta.json.analyzeOptions.scopeRules`

#### Scenario: Analyze with multiple scopes
- **WHEN** `gitnexus analyze --scope src/core --scope src/cli` is run
- **THEN** files under both `src/core` and `src/cli` SHALL be discovered
- **AND** both scope rules SHALL be persisted in order

#### Scenario: Scope with no matching files
- **WHEN** `--scope nonexistent/` is specified and no files match
- **THEN** the system SHALL report "No files found in scope" and exit with code 0

### Requirement: Repository Alias via --name
The system SHALL support `--name <alias>` to register the indexed repository under a user-provided alias instead of the path-derived basename. The alias SHALL be persisted to `meta.json.analyzeOptions.repoAlias` and reused on subsequent re-analyses of the same path.

#### Scenario: Register with custom alias
- **WHEN** `gitnexus analyze --name my-core-lib` is run on `/projects/core-lib`
- **THEN** the repo SHALL be registered as `my-core-lib` in the global registry
- **AND** subsequent `gitnexus analyze` on the same path SHALL preserve the alias without re-specifying `--name`

#### Scenario: Alias collision
- **WHEN** `--name existing-alias` is specified and `existing-alias` is already registered for a different path
- **THEN** the system SHALL reject with a `RegistryNameCollisionError`
- **AND** display actionable guidance: use `--allow-duplicate-name` to coexist, or pick a different alias

#### Scenario: Alias validation
- **WHEN** `--name` value does not match `^[a-zA-Z0-9._-]{3,64}$`
- **THEN** the system SHALL reject with a validation error describing the format constraint

### Requirement: Analyze Options Reuse via --reuse-options
The system SHALL support `--reuse-options` to persist scope, alias, and other analyze options across runs via `meta.json.analyzeOptions`. When present, stored options SHALL be validated on load; options referencing non-existent files or directories SHALL be discarded with a warning.

#### Scenario: Reuse options across runs
- **WHEN** `gitnexus analyze --scope src/core --name my-lib --reuse-options` is run
- **AND** then `gitnexus analyze` (no flags) is run on the same path
- **THEN** the second run SHALL reuse scope `src/core` and alias `my-lib` from `meta.json`

#### Scenario: Stored options with stale paths
- **WHEN** `meta.json.analyzeOptions.scopeRules` contains a path that no longer exists
- **THEN** the system SHALL emit a warning about the stale path
- **AND** discard it from the effective options
- **AND** continue with remaining valid scope rules

#### Scenario: Explicit --reuse-options=false
- **WHEN** `gitnexus analyze --reuse-options=false` is run
- **THEN** stored options SHALL be ignored for this run
- **AND** CLI flags take full precedence

### Requirement: CLI flags take priority over stored options
The system SHALL resolve analyze options in priority order: CLI flags > stored options (`meta.json.analyzeOptions`) > defaults.

#### Scenario: CLI overrides stored option
- **WHEN** `meta.json` stores `repoAlias: "old-name"` and `gitnexus analyze --name new-name` is run
- **THEN** the effective alias SHALL be `new-name`
- **AND** `new-name` SHALL be persisted to `meta.json` for future reuse
