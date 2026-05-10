# Specification Delta

## Capability 对齐（已确认）

- Capability: `test-repo-manager`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: 已确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: repo-manager-test-isolation
The test SHALL fully isolate its `GITNEXUS_HOME` to a temp directory so that `readRegistry()` does not pick up entries from the developer's shared `~/.gitnexus/registry.json`.

#### Scenario: registerRepo stores alias and rejects collisions
- **WHEN** `registerRepo` is called with `repoAlias: 'neonspark-v1-subset'` under a temp `GITNEXUS_HOME`
- **THEN** `entries[0].name` MUST be `'neonspark-v1-subset'` (not `'repo-a'`)
- **THEN** `readRegistry()` MUST only return entries written during the test
- **THEN** after the test completes, the temp `GITNEXUS_HOME` MUST be cleaned up
