# Specification Delta

## Capability 对齐（已确认）

- Capability: `cli-tool-direct-dispatch`
- 来源: `proposal.md` Capabilities → Modified
- 变更类型: modified
- 用户确认摘要: 已通过拆分方案确认，detectChangesCommand 函数移除需修复

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: Detect Changes CLI Command
The `src/cli/tool.ts` module SHALL export a `detectChangesCommand` function that accepts CLI-shaped arguments and invokes the `detect_changes` MCP tool through `LocalBackend.callTool`. If upstream has removed this function, the test SHALL be adapted to the upstream dispatch mechanism or the function SHALL be restored as a thin adapter.

#### Scenario: detectChangesCommand dispatches to MCP tool
- **WHEN** a developer calls `detectChangesCommand({ scope: 'compare', baseRef: 'main', repo: 'gitnexus' })`
- **THEN** `LocalBackend.callTool` is invoked with `('detect_changes', { scope: 'compare', base_ref: 'main', repo: 'gitnexus' })`

#### Scenario: detectChangesCommand handles zero changes
- **WHEN** `callTool` returns `{ summary: { changed_count: 0 } }`
- **THEN** the command outputs "No changes detected."

#### Scenario: detectChangesCommand handles errors
- **WHEN** `callTool` returns `{ error: 'index is stale' }`
- **THEN** the command outputs "Error: index is stale"
