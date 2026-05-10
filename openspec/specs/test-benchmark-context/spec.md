# Specification Delta

## Capability 对齐（已确认）

- Capability: `test-benchmark-context`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: 已确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: benchmark-tools-contract-assertions
The test SHALL update stale JSDoc assertion strings to match the current content of `gitnexus/src/mcp/tools.ts`.

#### Scenario: runtime-retrieval-contract-docs
- **WHEN** the test reads `gitnexus/src/mcp/tools.ts` and checks for specific substring patterns
- **THEN** assertions MUST match the actual `tools.ts` content, not an older version of the contract text
- **THEN** if `resource_heuristic` still exists in `tools.ts`, remove the negative assertion `expect(!text.includes('resource_heuristic')).toBeTruthy()`
- **THEN** if `response_profile=slim is the default` doesn't exist, replace with the actual current phrasing
