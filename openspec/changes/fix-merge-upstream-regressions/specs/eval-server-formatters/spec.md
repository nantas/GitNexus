# Specification Delta

## Capability 对齐（已确认）

- Capability: `eval-server-formatters`
- 来源: `proposal.md` Capabilities → Modified
- 变更类型: modified
- 用户确认摘要: 已通过拆分方案确认，formatContextResult evidence_mode 字段缺失需修复

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: Context Result Formatting with Evidence Mode
The `formatContextResult` function in `src/cli/eval-server.ts` SHALL include evidence mode information (e.g., `method_projected`) in its formatted output when the input context result contains an `evidence_mode` field.

#### Scenario: Evidence mode included in formatted context
- **WHEN** `formatContextResult` receives context data containing `evidence_mode: 'method_projected'`
- **THEN** the formatted output text SHALL contain `'method_projected'`
- **THEN** the formatted output text SHALL contain the associated confidence level (e.g., `'medium'`)
