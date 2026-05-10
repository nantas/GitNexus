# Specification Delta

## Capability 对齐（已确认）

- Capability: `test-setup`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: 已确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: setupCommand-agent-parameter
The test SHALL pass `{ agent: 'claude' }` to `setupCommand()` when testing Claude Code MCP config, and pass `{ agent: 'codex' }` when testing Codex MCP config, to match the current `setup.ts` API.

#### Scenario: setup.test.ts — non-Windows npx entry
- **WHEN** `setPlatform('darwin')` and `setupCommand({ agent: 'claude' })` is called
- **THEN** `.claude.json` is created at `$HOME/.claude.json` with `mcpServers.gitnexus` containing `{ command: 'gitnexus', args: ['mcp'] }`

#### Scenario: setup.test.ts — win32 cmd wrapper
- **WHEN** `setPlatform('win32')` and `setupCommand({ agent: 'claude' })` is called
- **THEN** `.claude.json` is created with `mcpServers.gitnexus` containing `{ command: 'cmd', args: ['/c', 'gitnexus', 'mcp'] }`

### Requirement: setup-jsonc-output-format
The test SHALL expect `getMcpEntry()` output format `{ command: string, args: string[] }`, not the old format with `type: 'local'` and `command: [...]`.

#### Scenario: setup-jsonc.test.ts — opencode entry
- **WHEN** `setupCommand({ agent: 'opencode' })` is called
- **THEN** `opencode.json` is created with `mcp.gitnexus` in `{ type: 'local', command: ['gitnexus', 'mcp'] }` format

#### Scenario: setup-jsonc.test.ts — cursor MCP entry
- **WHEN** `setupCommand({ agent: 'claude' })` is called
- **THEN** `.cursor/mcp.json` is created with `mcpServers.gitnexus` in `{ command: 'gitnexus', args: ['mcp'] }` format

### Requirement: setup-codex-agent-parameter
The test SHALL pass `{ agent: 'codex' }` to `setupCommand()` and expect `execFile` to be called with `'codex'` as the command.

#### Scenario: setup-codex.test.ts — non-Windows codex MCP
- **WHEN** `setupCommand({ agent: 'codex' })` is called on non-Windows platform
- **THEN** `execFileMock` is called with `'codex'` and appropriate MCP add arguments
