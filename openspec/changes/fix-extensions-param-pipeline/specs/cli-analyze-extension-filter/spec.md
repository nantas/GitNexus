# Specification Delta

## Capability 对齐（已确认）

- Capability: `cli-analyze-extension-filter`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: 确认只有 `cli-analyze-extension-filter`，无新增或修改

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: `extensions-cli-to-pipeline-chain`

The `--extensions` CLI parameter SHALL propagate from CLI parsing through the orchestrator into the pipeline scan phase, and SHALL be applied to filter scanned files before they enter the parse/analysis pipeline.

#### Scenario: `extensions-cli-flag-filters-scan`
- **WHEN** user runs `gitnexus analyze --extensions .cs <repo>`
- **THEN** only files ending with `.cs` are included in the scan output
- **AND** all files not matching `.cs` are excluded from graph construction, parsing, and downstream processing

#### Scenario: `no-extensions-flag-defaults-all`
- **WHEN** user runs `gitnexus analyze <repo>` without `--extensions`
- **THEN** all files (subject to .gitignore/file-size limits) are scanned, matching current behavior
- **AND** `ctx.options.includeExtensions` is `undefined` — no change to existing code paths

#### Scenario: `reuse-options-persists-extensions`
- **WHEN** user runs `gitnexus analyze --extensions .cs <repo>`, then runs `gitnexus analyze --reuse-options <repo>`
- **THEN** the second run SHALL apply the same `.cs` filter
- **AND** `includeExtensions` is persisted in `meta.json.analyzeOptions`

### Requirement: `extensions-filter-at-scan-stage`

The extension filter SHALL be applied at the earliest feasible point — during file scanning in `walkRepositoryPaths()` — to avoid unnecessary `stat()` and downstream processing of excluded files.

#### Scenario: `filter-before-batch-stat`
- **WHEN** `walkRepositoryPaths()` is called with `includeExtensions: ['.cs', '.ts']`
- **THEN** the glob results SHALL be filtered to only paths ending with `.cs` or `.ts` before entering the batch-stat loop
- **AND** files with non-matching extensions SHALL NOT be `stat()`'d

#### Scenario: `empty-extensions-list-no-filter`
- **WHEN** `walkRepositoryPaths()` is called with `includeExtensions: []`
- **THEN** the filter SHALL NOT be applied (empty list = no restriction)
- **AND** all glob results SHALL be processed normally

### Requirement: `interface-contract-unchanged`

The existing `PipelineOptions`, `AnalyzeOptions` (in `run-analyze.ts`), and `walkRepositoryPaths()` public interfaces SHALL remain backward-compatible. Adding `includeExtensions` as an optional field SHALL NOT break existing callers.

#### Scenario: `existing-callers-unaffected`
- **WHEN** existing code calls `runPipelineFromRepo()` without the `includeExtensions` option
- **THEN** `ctx.options.includeExtensions` is `undefined`
- **AND** `scanPhase` SHALL pass `undefined` to `walkRepositoryPaths()`
- **AND** `walkRepositoryPaths()` SHALL behave identically to the current (no-filter) behavior

#### Scenario: `test-for-extension-filtering`
- **WHEN** `walkRepositoryPaths()` is called with `includeExtensions: ['.cs']` on a mixed directory
- **THEN** only `.cs` files appear in the returned array
- **AND** `.ts`, `.js`, `.md` files in the same directory are excluded
