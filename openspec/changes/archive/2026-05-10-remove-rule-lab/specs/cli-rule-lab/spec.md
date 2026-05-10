# Specification Delta

## Capability 对齐（已确认）

- Capability: `cli-rule-lab`
- 来源: `proposal.md`
- 变更类型: modified (remove entire CLI command tree)
- 用户确认摘要: 用户已确认删除 rule-lab CLI 命令树（6 个子命令 + compile 命令）

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## REMOVED Requirements

### Requirement: CLI Commands

**Reason**: The `rule-lab` command tree is entirely removed from the CLI. This includes:
- `gitnexus rule-lab analyze`
- `gitnexus rule-lab review-pack`
- `gitnexus rule-lab curate`
- `gitnexus rule-lab promote`
- `gitnexus rule-lab regress`
- `gitnexus rule-lab compile`

**Migration**: Any script or user workflow calling `gitnexus rule-lab *` will receive an "unknown command" error. No known external dependency on these commands.

### Requirement: Command Registration

**Reason**: `cli/index.ts` SHALL no longer call `attachRuleLabCommands` or create lazy import actions for `./rule-lab.js`.

**Migration**: Remove the import and the lazy factory entries for the rule-lab handler names. The `cli/rule-lab.ts` file is deleted entirely.
