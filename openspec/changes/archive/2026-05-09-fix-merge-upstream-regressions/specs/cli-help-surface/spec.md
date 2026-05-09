# Specification Delta

## Capability 对齐（已确认）

- Capability: `cli-help-surface`
- 来源: `proposal.md` Capabilities → Modified
- 变更类型: modified
- 用户确认摘要: 已通过拆分方案确认，detect-changes 和 wiki help 输出需对齐

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: Detect-Changes Help Output
The `gitnexus detect-changes --help` command SHALL output help text that includes `--scope <scope>`, `--base-ref <ref>`, and `--repo <name>` flags.

#### Scenario: detect-changes help shows expected flags
- **WHEN** a developer runs `gitnexus detect-changes --help`
- **THEN** the output SHALL contain `--scope <scope>`, `--base-ref <ref>`, and `--repo <name>`

### Requirement: Wiki Help Output
The `gitnexus wiki --help` command SHALL output help text that includes `--provider <provider>`, `--review`, and `-v, --verbose` flags.

#### Scenario: wiki help shows expected flags
- **WHEN** a developer runs `gitnexus wiki --help`
- **THEN** the output SHALL contain `--provider <provider>`, `--review`, and `-v, --verbose`
