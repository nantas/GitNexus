# Specification Delta

## Capability 对齐（已确认）

- Capability: `mcp-improvements`
- 来源: `proposal.md`
- 变更类型: `new`

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## ADDED Requirements

### Requirement: Parallel Staleness Checks
The system SHALL parallelize staleness checks in `list_repos` to reduce MCP startup latency.

#### Scenario: Multiple repos listed
- **WHEN** `list_repos` is called with 5 indexed repositories
- **THEN** staleness checks SHALL run concurrently, not sequentially

### Requirement: Tool Safety Annotations
The system SHALL annotate MCP tools with safety metadata (`readOnly`, `idempotent`, etc.) for tool-aware clients.

#### Scenario: Tool annotation discovery
- **WHEN** an MCP client requests `tools/list`
- **THEN** each tool's response SHALL include `annotations` with safety metadata

### Requirement: Import Closure Query
The system SHALL support import closure queries via MCP, returning the full transitive import graph for a given file or symbol.

#### Scenario: Import closure for file
- **WHEN** `import_closure` is called with a file path
- **THEN** the response SHALL include all direct and transitive imports

### Requirement: Stdout Discipline
The system SHALL enforce strict stdout/stderr separation in MCP transport, preventing log output from contaminating JSON-RPC messages on stdout.

#### Scenario: Log during tool execution
- **WHEN** the server emits a log message during an MCP tool call
- **THEN** the log message SHALL appear on stderr only, not stdout
