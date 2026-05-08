# Specification Delta

## Capability 对齐（已确认）

- Capability: `pino-structured-logging`
- 来源: `proposal.md`
- 变更类型: `new`
- 用户确认摘要: 全选进行，23 个 capability 全部确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## ADDED Requirements

### Requirement: Pino Logger Adoption
The system SHALL use pino as the structured logging backend for all runtime log output, replacing ad-hoc `console.log`/`console.error` calls in the CLI and server paths.

#### Scenario: CLI verbose output
- **WHEN** the user runs any CLI command with `--verbose`
- **THEN** log output SHALL be emitted via pino with level `debug` and structured fields

#### Scenario: Server request logging
- **WHEN** the MCP server processes a tool call
- **THEN** request lifecycle events SHALL be logged via pino with `reqId`, `toolName`, and `duration` fields

### Requirement: Logger Compatibility
The system SHALL NOT break existing log-dependent behavior (e.g., MCP stdout protocol, CLI progress output) when switching to pino.

#### Scenario: MCP stdout integrity
- **WHEN** the MCP server writes JSON-RPC responses to stdout
- **THEN** pino log output SHALL be redirected to stderr, not stdout
