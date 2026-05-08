# Specification Delta

## Capability 对齐（已确认）

- Capability: `unity-runtime-process`
- 来源: `proposal.md` / Modified Capabilities
- 变更类型: `modified`
- 用户确认摘要: 全选进行

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: Functionality Preservation
The system SHALL preserve all Unity runtime process functionality unchanged after infrastructure merge: resource binding extraction, synthetic edge generation, hydration, parity verification, lazy overlay, and Cypher workflow execution.

#### Scenario: Post-merge Unity analyze
- **WHEN** `gitnexus analyze --unity-bindings` is run on a Unity project
- **THEN** the same Unity resource bindings and derived processes SHALL be produced as before the merge

### Requirement: Infrastructure Compatibility
The system SHALL adapt Unity-specific code paths to work with upstream's changed interfaces in scope-resolution, LanguageProvider, and DAG pipeline without modifying Unity business logic.

#### Scenario: Unity enrichment after scope resolution change
- **WHEN** the ingestion pipeline uses registry-primary scope resolution
- **THEN** Unity enrichment (which reads graph edges) SHALL produce the same synthetic edges

### Requirement: Unity Module Isolation
The system SHALL keep Unity-specific modules (`gitnexus/src/core/unity/`, `gitnexus/src/mcp/local/unity-*.ts`, `gitnexus/src/rule-lab/`) as self-contained units that depend on stable interfaces rather than internal implementation details of shared infrastructure.

#### Scenario: Upstream refactor of shared module
- **WHEN** upstream refactors `call-processor.ts` interface
- **THEN** Unity modules SHALL require only interface-level adaptation, not logic rewrites

### Requirement: Regression Gate
The system SHALL pass the Unity benchmark gate (`npm run test:benchmark` or `npm run u3:gates`) after merge, with no regression in runtime chain verification accuracy.

#### Scenario: Benchmark gate after merge
- **WHEN** the Unity benchmark suite is run
- **THEN** accuracy scores SHALL match or exceed pre-merge baselines
