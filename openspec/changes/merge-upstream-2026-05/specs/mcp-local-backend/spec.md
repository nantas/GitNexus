# Specification Delta

## Capability 对齐（已确认）

- Capability: `mcp-local-backend`
- 来源: `proposal.md` / Modified Capabilities
- 变更类型: `modified`
- 用户确认摘要: 全选进行

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: Unity Context Query
The system SHALL support Unity-specific context queries that return resource bindings, lifecycle process chains, and runtime evidence when querying a Unity repository.

#### Scenario: Unity context retrieval
- **WHEN** `context` tool is called on a Unity repo with `symbol=<MonoBehaviour>`
- **THEN** the response SHALL include `resourceBindings`, `derivedProcesses`, and `processRef` sections

### Requirement: Unity Hydration Modes
The system SHALL support lazy hydration (`hydration=strict`) and parity hydration for Unity resource bindings, with configurable warmup queue and overlay cache.

#### Scenario: Lazy hydration expansion
- **WHEN** `context` is called with `hydration=strict` on a Unity runtime symbol
- **THEN** resource bindings SHALL be hydrated on-demand with provenance tracking

### Requirement: Query Safety
The system SHALL execute all Cypher queries through parameterized execution, rejecting queries that contain write operations or injection patterns.

#### Scenario: Write query rejection
- **WHEN** a query containing `CREATE` or `DELETE` is submitted
- **THEN** the query SHALL be rejected with an error

### Requirement: Agent-Safe Response
The system SHALL produce agent-safe response envelopes for Unity runtime queries, including confidence scores, evidence mode indicators, and disambiguation candidates.

#### Scenario: Response with confidence
- **WHEN** a Unity runtime chain query is executed
- **THEN** the response SHALL include `confidence` (verifier-core + policy-adjusted) and `evidence` fields

### Requirement: Response Profiles
The system SHALL support `response_profile=slim` (default) and `response_profile=full` for controlling response verbosity. The `full` profile SHALL include hydration diagnostics and parity data.

#### Scenario: Full response profile
- **WHEN** `context` is called with `response_profile=full`
- **THEN** the response SHALL include `hydrationMeta`, parity status, and detailed evidence

### Requirement: Cypher Workflow Execution
The system SHALL support pre-defined Cypher workflow execution for Unity runtime queries via `query/context` with cypher-based evidence collection.

#### Scenario: Runtime chain cypher workflow
- **WHEN** `query/context` matches a known Unity runtime process (e.g., Reload)
- **THEN** the corresponding Cypher workflow SHALL execute to collect evidence edges
