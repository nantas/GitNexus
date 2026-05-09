# Capability: mcp-tools

## Purpose
Define Unity hydration semantic terms that SHALL appear in MCP tool descriptions for query and context tools.
## Requirements
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

