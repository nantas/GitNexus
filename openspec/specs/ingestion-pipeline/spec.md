# Specification Delta

## Capability 对齐（已确认）

- Capability: `ingestion-pipeline`
- 来源: `proposal.md` Modified Capabilities
- 变更类型: modified
- 用户确认摘要: 全部确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: parse-output-includes-preextracted-parsedfiles
`ParseOutput` SHALL include an optional `preExtractedParsedFiles: readonly ParsedFile[] | undefined` field. When the worker pool was engaged and ParsedFiles were produced, this field SHALL be set. When the sequential path ran (scopeTreeCache already populated), this field SHALL be `undefined`.

#### Scenario: worker-path-sets-preextracted
- **WHEN** `parse-impl.ts` runs with a worker pool and `chunkWorkerData.parsedFiles` is non-empty across all chunks
- **THEN** `ParseOutput.preExtractedParsedFiles` SHALL be a concatenated array of all `ParedFile` objects from all chunks

#### Scenario: sequential-path-leaves-undefined
- **WHEN** `parse-impl.ts` runs via the sequential fallback path (no worker pool)
- **THEN** `ParseOutput.preExtractedParsedFiles` SHALL be `undefined`

#### Scenario: empty-worker-output-leaves-undefined
- **WHEN** the worker pool is engaged but no language provider implements `emitScopeCaptures`
- **THEN** `ParseOutput.preExtractedParsedFiles` SHALL be `undefined`

### Requirement: worker-skips-redundant-extraction-for-registry-primary
Parse worker SHALL skip `extractParsedFile` and legacy extraction (calls/imports/heritage query matching) for languages where `isRegistryPrimary(language)` is true.

#### Scenario: csharp-skips-scope-extraction-in-worker
- **WHEN** parse worker processes a `.cs` file
- **THEN** it SHALL NOT call `extractParsedFile` for that file
- **AND** it SHALL NOT run legacy query extraction for calls/imports/heritage (the `isRegistryPrimary` gate already discards them, so skip the query matching entirely)

#### Scenario: non-registry-primary-continues-as-before
- **WHEN** parse worker processes a file whose language is NOT in `MIGRATED_LANGUAGES`
- **THEN** `extractParsedFile` and legacy extraction SHALL be called as before (no change)

#### Scenario: python-skips-extraction-in-worker
- **WHEN** parse worker processes a `.py` file (Python is in `MIGRATED_LANGUAGES`)
- **THEN** it SHALL skip `extractParsedFile` and legacy extraction for that file

### Requirement: scope-resolution-uses-preextracted-data
Scope-resolution phase SHALL check for `ParseOutput.preExtractedParsedFiles` before deciding whether to execute the extract stage.

#### Scenario: scope-resolution-receives-preextracted
- **WHEN** `scopeResolutionPhase.execute()` reads `parseOutput.preExtractedParsedFiles` and it is non-empty
- **THEN** it SHALL pass the array to `runScopeResolution` as `preExtractedParsedFiles`
- **AND** `runScopeResolution` SHALL skip the per-file `extractParsedFile` loop
- **AND** `runScopeResolution` SHALL not call `readFileContents` for those files

#### Scenario: scope-resolution-falls-back-without-preextracted
- **WHEN** `parseOutput.preExtractedParsedFiles` is `undefined`
- **THEN** scope-resolution SHALL execute the existing extraction path (readFileContents + per-file extractParsedFile)
