# Specification Delta

## Capability 对齐（已确认）

- Capability: `scope-resolution-progress`
- 来源: `proposal.md` New Capabilities
- 变更类型: new
- 用户确认摘要: 全部确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## ADDED Requirements

### Requirement: scope-resolution-emits-per-phase-progress
Scope-resolution phase SHALL emit progress events for each sub-stage (extract, finalize, resolve, emit) to the pipeline progress callback.

#### Scenario: extract-stage-progress
- **WHEN** scope-resolution enters the extract stage (reading and parsing files)
- **THEN** it SHALL emit `onProgress` with `phase: 'scopeResolution'`, `message: 'Extracting scope from N files...'`, and a percentage proportional to files processed

#### Scenario: finalize-stage-progress
- **WHEN** scope-resolution enters the finalize stage (building ScopeResolutionIndexes)
- **THEN** it SHALL emit `onProgress` with `phase: 'scopeResolution'`, `message: 'Finalizing scope model...'`

#### Scenario: resolve-stage-progress
- **WHEN** scope-resolution enters the resolve stage (resolving reference sites)
- **THEN** it SHALL emit `onProgress` with `phase: 'scopeResolution'`, `message: 'Resolving references...'`

#### Scenario: emit-stage-progress
- **WHEN** scope-resolution enters the emit stage (writing graph edges)
- **THEN** it SHALL emit `onProgress` with `phase: 'scopeResolution'`, `message: 'Emitting scope edges...'`

#### Scenario: preextracted-fast-path
- **WHEN** `preExtractedParsedFiles` is provided (no extract stage)
- **THEN** it SHALL emit `onProgress` with `phase: 'scopeResolution'`, `message: 'Using pre-extracted scope data (N files)...'`
- **AND** SHALL then proceed to finalize/resolve/emit with progress updates

### Requirement: progress-context-includes-file-count
Progress events SHALL include `stats.filesProcessed` and `stats.totalFiles` in the progress payload.

#### Scenario: progress-stats
- **WHEN** any scope-resolution progress event is emitted
- **THEN** the `PipelineProgress.stats` field SHALL be set with `{ filesProcessed: <current>, totalFiles: <total>, nodesCreated: <graph node count> }`
