# Specification Delta

## Capability 对齐（已确认）

- Capability: `parse-scope-bridge`
- 来源: `proposal.md` New Capabilities
- 变更类型: new
- 用户确认摘要: 全部确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## ADDED Requirements

### Requirement: worker-parsed-files-forwarded
Parse phase MUST forward `ParsedFile[]` produced by worker pool to downstream phases via `ParseOutput`.

#### Scenario: worker-produces-parsedfiles
- **WHEN** `processParsingWithWorkers` returns `WorkerExtractedData` containing non-empty `parsedFiles` array
- **THEN** `parse-impl.ts` SHALL accumulate `parsedFiles` across all chunks and expose them through `ParseOutput.preExtractedParsedFiles`

#### Scenario: sequential-path-no-parsedfiles
- **WHEN** `processParsingSequential` path runs (worker pool not engaged)
- **THEN** `ParseOutput.preExtractedParsedFiles` SHALL be `undefined`
- **AND** behavior SHALL be identical to current sequential path (scopeTreeCache already populated)

#### Scenario: empty-parsedfiles-array
- **WHEN** worker pool is engaged but no file's provider implements `emitScopeCaptures`
- **THEN** `ParseOutput.preExtractedParsedFiles` SHALL be `undefined` (empty array treated as no pre-extraction)

### Requirement: scope-resolution-consumes-preextracted
Scope-resolution phase MUST accept and use pre-extracted `ParsedFile[]` when available, bypassing the extract stage.

#### Scenario: preextracted-available-skips-extract
- **WHEN** `ParseOutput.preExtractedParsedFiles` is a non-empty `ParsedFile[]`
- **THEN** `scopeResolutionPhase.execute()` SHALL pass them to `runScopeResolution` via the `preExtractedParsedFiles` parameter
- **AND** `runScopeResolution` SHALL skip the `extractParsedFile` + `readFileContents` loop
- **AND** `runScopeResolution` SHALL still call `populateOwners` on each forwarded ParsedFile

#### Scenario: preextracted-unavailable-falls-back
- **WHEN** `ParseOutput.preExtractedParsedFiles` is `undefined`
- **THEN** `runScopeResolution` SHALL execute the existing extract stage (readFileContents + extractParsedFile per file)
- **AND** `scopeTreeCache` SHALL be consumed as before for cache-hit optimization

#### Scenario: scoperesolution-passes-preextracted-to-hooks
- **WHEN** `runScopeResolution` receives `preExtractedParsedFiles`
- **THEN** post-extract hooks (`populateWorkspaceOwners`, `populateNamespaceSiblings`, `populateRangeBindings`) SHALL receive the same `fileContents` map built from the `files` parameter or pre-extracted data source
- **AND** `populateNamespaceSiblings` SHALL receive `fileContents` built from `preExtractedParsedFiles` file paths

### Requirement: parse-output-contract-unchanged
New `ParseOutput.preExtractedParsedFiles` field MUST be optional and backward-compatible.

#### Scenario: downstream-consumer-without-field
- **WHEN** a downstream phase reads `ParseOutput` without accessing `preExtractedParsedFiles`
- **THEN** behavior SHALL be identical to current state (no compilation error, no runtime error)

#### Scenario: type-safety-preserved
- **WHEN** `preExtractedParsedFiles` is present
- **THEN** its type SHALL be `readonly ParsedFile[] | undefined`
- **AND** TypeScript SHALL enforce `readonly` at the type level
