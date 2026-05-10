# Specification Delta

## Capability 对齐（已确认）

- Capability: `mcp-local-backend`
- 来源: `proposal.md`
- 变更类型: modified (remove rule-lab dispatch)
- 用户确认摘要: 用户已确认移除 rule-lab 工具分派要求，清理 handlers 和 imports

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## REMOVED Requirements

### Requirement: Rule Lab Tool Dispatch

**Reason**: rule-lab 系统已从产品工作流退役。`callTool` 不再需要识别或分派 `rule_lab_analyze`、`rule_lab_review_pack`、`rule_lab_curate`、`rule_lab_promote`、`rule_lab_regress` 工具调用。相关 handler 方法、imports 和 switch-case 分支全部删除。

**Migration**: 移除 `rule_lab_*` MCP 工具定义后，外部调用方将收到 `Unknown tool` 错误。无已知外部依赖方。

## MODIFIED Requirements

### Requirement: Purpose Update

The `mcp-local-backend` spec purpose SHALL no longer reference rule-lab. The capability is defined as: "Define Unity-specific helper functions for the MCP local-backend module."

#### Scenario: Spec purpose updated
- **WHEN** a developer reads the spec purpose
- **THEN** it SHALL NOT contain the term "rule-lab"
