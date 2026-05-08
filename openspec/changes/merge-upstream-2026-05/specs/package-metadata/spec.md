# Specification Delta

## Capability 对齐（已确认）

- Capability: `package-metadata`
- 来源: `proposal.md` / Modified Capabilities
- 变更类型: `modified`
- 用户确认摘要: 全选进行

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: Package Name and Scope
The system SHALL retain the `@veewo/gitnexus` scoped package name in `gitnexus/package.json`.

#### Scenario: Package identity
- **WHEN** `npm view @veewo/gitnexus` is run
- **THEN** the package SHALL be listed under the `@veewo` scope

### Requirement: Merged Dependencies
The system SHALL include dependencies required by both fork features (benchmark CLI, Unity resource scanning, yaml parsing) and upstream features (Kotlin tree-sitter, Dart grammar, pino logger, thrift parser).

#### Scenario: Dependency resolution
- **WHEN** `npm install` is run after merge
- **THEN** all dependencies SHALL resolve without conflicts

### Requirement: Merged Scripts
The system SHALL merge test and build scripts from both sides, preserving fork-specific scripts (`benchmark`, `benchmark-agent-context`, `u3:gates`) and absorbing upstream scripts where non-conflicting.

#### Scenario: Script execution
- **WHEN** `npm test` is run
- **THEN** all tests (upstream + fork) that pass SHALL be included in the run

### Requirement: Regenerated Lockfile
The system SHALL regenerate `package-lock.json` from the merged `package.json` after all dependency changes are finalized.

#### Scenario: Lockfile consistency
- **WHEN** `npm install` completes
- **THEN** `package-lock.json` SHALL be consistent with the merged `package.json`
