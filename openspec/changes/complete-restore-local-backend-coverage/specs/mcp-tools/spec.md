# Specification Delta

## Capability 对齐（已确认）

- Capability: `mcp-tools`
- 来源: `proposal.md` Capabilities → Modified
- 变更类型: modified
- 用户确认摘要: 已通过拆分方案确认，tool descriptions 中 Unity hydration 术语需补充

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: Query Tool Description with Hydration Semantics
The `query` tool description SHALL include Unity hydration semantic terms: `strict`, `fallbackToCompact`, and `policy-adjusted`. These terms describe the hydration completeness levels and policy-adjusted confidence semantics available through the query handler.

#### Scenario: Query description contains strict
- **WHEN** a developer reads the `query` tool description
- **THEN** the text SHALL contain the term `strict`

#### Scenario: Query description contains fallbackToCompact
- **WHEN** a developer reads the `query` tool description
- **THEN** the text SHALL contain the term `fallbackToCompact`

#### Scenario: Query description contains policy-adjusted
- **WHEN** a developer reads the `query` tool description
- **THEN** the text SHALL contain the term `policy-adjusted`

### Requirement: Context Tool Description with Hydration Semantics
The `context` tool description SHALL include Unity hydration semantic terms: `strict`, `fallbackToCompact`, and `policy-adjusted`. These terms describe the hydration completeness levels and policy-adjusted confidence semantics available through the context handler.

#### Scenario: Context description contains strict
- **WHEN** a developer reads the `context` tool description
- **THEN** the text SHALL contain the term `strict`

#### Scenario: Context description contains fallbackToCompact
- **WHEN** a developer reads the `context` tool description
- **THEN** the text SHALL contain the term `fallbackToCompact`

#### Scenario: Context description contains policy-adjusted
- **WHEN** a developer reads the `context` tool description
- **THEN** the text SHALL contain the term `policy-adjusted`
