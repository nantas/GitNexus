# Specification Delta

## Capability 对齐（已确认）

- Capability: `setup-repository-analyze-config`
- 来源: `proposal.md` 的 New Capabilities
- 变更类型: `new`
- 用户确认摘要: 用户确认仅新增“项目级 setup 创建 `.gitnexusrc` 并经确认迁移旧索引元数据”能力，不修改 analyze 行为。

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源。
- design、tasks、verification 必须引用本文件；项目页面回写不得替代本文件。

## ADDED Requirements

### Requirement: project-setup-rc-modes

The system SHALL provide `--rc-mode auto|migrate|create|skip` for `gitnexus setup`. Project scope SHALL default to `auto`; global scope and the separate `--coding-agent` route SHALL leave repository rc files untouched. The existing `--scope` flag SHALL continue to select installation location, never analyze paths. Explicit `migrate` or `create` in a non-project setup MUST fail before writing setup files.

#### Scenario: project-default-auto
- **WHEN** the user runs `gitnexus setup --scope project --agent codex` in a Git repository
- **THEN** setup evaluates that repository's `.gitnexusrc` state in `auto` mode
- **AND** the existing project MCP and skill installation remains available.

#### Scenario: global-setup-does-not-select-a-repository
- **WHEN** the user runs global setup or `setup --coding-agent codex`
- **THEN** setup does not create or migrate `.gitnexusrc` in the current directory.

#### Scenario: explicit-repository-mode-requires-project-scope
- **WHEN** `--rc-mode migrate` or `--rc-mode create` is combined with global setup or `--coding-agent`
- **THEN** setup exits nonzero with a usage error before changing MCP wiring, skills, or rc files.

### Requirement: rc-plan-before-write

Project setup SHALL build and display a read-only rc plan before requesting confirmation or writing configuration. The plan SHALL include the target repository, proposed JSON, source metadata path and analysis date when available, each migrated field's source, unresolved choices, and conflicts. Missing scope or extension arrays MUST be classified as unknown; explicit empty arrays SHALL mean unrestricted selection.

#### Scenario: new-repository-needs-selection
- **GIVEN** a project has no `.gitnexusrc` and no usable scope or extension receipt
- **WHEN** interactive `auto` setup runs
- **THEN** setup asks the user to choose full or scoped paths and full or selected extensions before proposing a file
- **AND** it does not silently propose a full-repository scan.

#### Scenario: coverage-and-legacy-conflict
- **GIVEN** `indexCoverage.scopeRules` differs from `analyzeOptions.scopeRules`
- **WHEN** setup plans migration
- **THEN** it displays both values and their sources
- **AND** does not write rc until the user resolves the conflict.

### Requirement: metadata-source-integrity

Migration SHALL read the index metadata resolved for the current repository without mutating it. `gitnexus.json` SHALL be authoritative when present; `meta.json` MAY be used only when the primary is provably absent. The metadata's canonical `repoPath` MUST identify the setup target. A corrupt, unreadable, or foreign primary SHALL NOT be bypassed by a legacy mirror. Because rc is repository-wide, conflicting active-branch and flat-slot selections MUST require an explicit repository-wide choice.

#### Scenario: missing-primary-uses-legacy-mirror
- **GIVEN** `gitnexus.json` is absent and a valid, owned `meta.json` exists
- **WHEN** project setup plans migration
- **THEN** it may use `meta.json` and identifies that file in the preview.

#### Scenario: corrupt-primary-does-not-fall-back
- **GIVEN** `gitnexus.json` exists but cannot be parsed and `meta.json` is valid
- **WHEN** project setup plans migration
- **THEN** it reports the primary error and does not use the mirror
- **AND** explicit `migrate` fails before other setup writes; default `auto` may finish editor setup with rc pending.

#### Scenario: copied-or-divergent-index-is-not-migrated-silently
- **GIVEN** metadata identifies another repository, or branch receipts disagree on scope or extensions
- **WHEN** project setup plans migration
- **THEN** it does not create rc from a guessed receipt
- **AND** reports the ownership error or asks for a repository-wide selection.

### Requirement: supported-legacy-option-mapping

Migration SHALL map only supported, validated option fields. It SHALL prefer `indexCoverage.scopeRules` and `indexCoverage.includeExtensions` as the last successful selection, falling back to legacy `analyzeOptions` only when each coverage field is absent. It SHALL map legacy `repoAlias` to rc `name`, `csharpDefineCsproj` to the same key, `embeddings` to the same key, and `aiContext === false` to `skipAgentsMd: true`. It MAY propose non-default `indexCoverage.maxFileSizeBytes` as `maxFileSize` only when exactly expressible in KiB. It MUST NOT infer defaults from `fileHashes`, `analysisInputFingerprint`, embedding counts, `repoId`, or a nearby csproj file.

#### Scenario: v159-legacy-options
- **GIVEN** v1.5.9 metadata contains scoped paths, `.cs`/`.meta` extensions, a repo alias, a valid C# project path, `embeddings: true`, and `aiContext: false`
- **WHEN** setup produces a migration plan
- **THEN** the proposed rc contains the corresponding `scopeRules`, `includeExtensions`, `name`, `csharpDefineCsproj`, `embeddings`, and `skipAgentsMd` values with their sources shown.

#### Scenario: coverage-only-receipt
- **GIVEN** current metadata has `indexCoverage` arrays but no `analyzeOptions`
- **WHEN** setup produces a migration plan
- **THEN** the plan uses the coverage arrays
- **AND** leaves unknown name and C# project settings absent rather than inventing values.

#### Scenario: missing-array-is-not-full-selection
- **GIVEN** both coverage and legacy metadata omit `includeExtensions`
- **WHEN** setup produces a migration plan
- **THEN** extensions remain unresolved until the user chooses `all` or provides an extension list
- **AND** no unattended rc write occurs.

### Requirement: interactive-and-scripted-creation

Interactive project setup SHALL show and confirm a complete rc plan before creating the file. Non-interactive default `auto` SHALL never prompt or write a missing rc; it SHALL complete ordinary editor setup with `Analysis config: pending` and an actionable explicit command. Explicit non-interactive `migrate` or `create` SHALL require `--accept-rc` and a complete, conflict-free plan. `create` SHALL require an explicit path and extension selection through `--rc-scope` and `--rc-extensions`; each SHALL accept `all` or a comma-separated list. Optional `--rc-name` and `--rc-csharp-define-csproj` SHALL be validated.

#### Scenario: noninteractive-auto-remains-pending
- **GIVEN** no rc exists and standard input is not a TTY
- **WHEN** project setup runs with default `auto`
- **THEN** it does not block on input or write rc
- **AND** it reports `Analysis config: pending` with a command that supplies the missing choices.

#### Scenario: explicit-scripted-scoped-create
- **WHEN** project setup runs non-interactively with `--rc-mode create --rc-scope Assets/,Packages/ --rc-extensions .cs,.meta --accept-rc`
- **THEN** it creates an rc containing those exact normalized selections after validation.

#### Scenario: incomplete-explicit-request-fails-early
- **WHEN** non-interactive `create` omits extensions, or non-interactive `migrate` has unresolved conflicts, or either omits `--accept-rc`
- **THEN** setup exits nonzero before changing MCP wiring, skills, or rc.

### Requirement: rc-validation-and-preservation

Setup SHALL validate proposed JSON with the same effective key and value rules as `analyze`, and SHALL create the root rc with no-overwrite semantics and no partial final file. A valid existing rc SHALL be preserved byte-for-byte in default `auto` mode. An invalid, symlinked, or hard-linked existing rc MUST be reported before other setup writes; explicit `create` or `migrate` MUST NOT overwrite any existing rc. `--rc-mode skip` SHALL leave rc unread and unchanged while allowing editor-only setup.

#### Scenario: repeated-setup-preserves-existing-rc
- **GIVEN** a valid `.gitnexusrc` exists
- **WHEN** project setup runs twice in default `auto` mode
- **THEN** it reports `Analysis config: preserved` and the rc bytes are unchanged.

#### Scenario: invalid-existing-rc-fails-before-writes
- **GIVEN** `.gitnexusrc` is malformed, symlinked, or hard-linked
- **WHEN** project setup runs in `auto`, `migrate`, or `create` mode
- **THEN** it reports the rc error before modifying setup outputs.

#### Scenario: concurrent-creator-wins
- **GIVEN** another process creates `.gitnexusrc` after planning but before setup installs it
- **WHEN** setup attempts creation
- **THEN** it reports that rc already exists and does not overwrite or leave a partial final rc.

### Requirement: setup-result-and-rebuild-boundary

Project setup SHALL report rc state as `created`, `preserved`, `pending`, `skipped`, or `failed` and show the effective scope/extensions when known. It SHALL direct the user to run `gitnexus analyze` after a created rc, but MUST NOT run analyze, clean, database repair, or metadata rewrite itself. It MUST NOT describe CLI runner identity or graph schema fingerprints as a LadybugDB file-format version.

#### Scenario: confirmed-migration-has-next-step
- **WHEN** setup creates rc from a confirmed legacy plan
- **THEN** it reports `Analysis config: created`, the selected paths/extensions, and an analyze next step
- **AND** the existing index and metadata remain unchanged until a later analyze.

#### Scenario: skipped-or-pending-is-not-ready
- **WHEN** rc creation is skipped or remains pending
- **THEN** the setup summary does not claim that the intended analysis scope has been installed.
