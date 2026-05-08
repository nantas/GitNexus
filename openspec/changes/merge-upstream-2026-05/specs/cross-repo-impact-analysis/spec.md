# Specification Delta

## Capability 对齐（已确认）

- Capability: `cross-repo-impact-analysis`
- 来源: `proposal.md`
- 变更类型: `new`

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## ADDED Requirements

### Requirement: @repo MCP Routing
The system SHALL support `@repo` prefix in MCP tool calls to route queries to a specific indexed repository.

#### Scenario: Cross-repo query
- **WHEN** an MCP tool call includes `repo=@other-service`
- **THEN** the query SHALL execute against the graph of `other-service`

### Requirement: Group Impact Analysis
The system SHALL compute impact across multiple repositories within a defined group, producing a unified impact report.

#### Scenario: Group impact
- **WHEN** `gitnexus group impact <group-name> --symbol <symbol-id>` is run
- **THEN** impact results SHALL span all repositories in the group
