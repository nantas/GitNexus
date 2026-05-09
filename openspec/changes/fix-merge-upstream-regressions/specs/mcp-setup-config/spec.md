# Specification Delta

## Capability 对齐（已确认）

- Capability: `mcp-setup-config`
- 来源: `proposal.md` Capabilities → Modified
- 变更类型: modified
- 用户确认摘要: 已通过拆分方案确认，MCP manifest 和 guidance 文本需匹配当前 setup 结构

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: MCP Manifest Generation
The MCP setup configuration generation SHALL produce a manifest JSON that includes `"args": ["mcp"]` for the gitnexus server entry, reflecting the current CLI dispatch mechanism.

#### Scenario: MCP manifest includes args field
- **WHEN** the system generates an MCP manifest JSON
- **THEN** the gitnexus server entry SHALL include `"args": ["mcp"]`

### Requirement: Guidance Text Resolution
The generated guidance text for setup SHALL reference `resolveAnalyzeNpxCommand` for dynamic npx version resolution instead of hardcoded version strings.

#### Scenario: Guidance uses dynamic version resolution
- **WHEN** the system generates setup guidance text
- **THEN** the text SHALL contain a reference to `resolveAnalyzeNpxCommand` for version resolution
