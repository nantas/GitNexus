# Specification Delta

## Capability 对齐（已确认）

- Capability: `benchmark-system`
- 来源: `proposal.md` / Modified Capabilities
- 变更类型: `modified`
- 用户确认摘要: 全选进行

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: Benchmark CLI Preservation
The system SHALL preserve all benchmark CLI commands: `benchmark-unity`, `benchmark-agent-context`, `benchmark-agent-safe-query-context`, `benchmark-u2-e2e`, and `benchmark`.

#### Scenario: Unity benchmark execution
- **WHEN** `gitnexus benchmark-unity --dataset neonspark-v1` is run
- **THEN** the benchmark SHALL execute and produce a scored report

### Requirement: Infrastructure Compatibility
The system SHALL adapt benchmark runners to work with upstream's changed analyze output format, MCP response structure, and logger interface.

#### Scenario: Benchmark tool adapter after merge
- **WHEN** `benchmark-unity` calls analyze via the tool adapter
- **THEN** the adapter SHALL correctly parse analyze output in the new format

### Requirement: Baseline Stability
The system SHALL preserve existing benchmark baselines (`benchmarks/unity-baseline/`, `benchmarks/agent-context/`) as reference data, noting any expected metric drift caused by infrastructure changes (not functional regressions).

#### Scenario: Baseline comparison
- **WHEN** a post-merge benchmark run is compared against baselines
- **THEN** any metric deviations SHALL be attributable to infrastructure changes, not Unity logic regressions
