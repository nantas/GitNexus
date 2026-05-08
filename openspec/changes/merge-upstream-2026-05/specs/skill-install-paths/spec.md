# Specification Delta

## Capability 对齐（已确认）

- Capability: `skill-install-paths`
- 来源: `proposal.md` / Modified Capabilities
- 变更类型: `modified`
- 用户确认摘要: 全选进行

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: Skill Directory Convention
The system SHALL install skills under `.agents/skills/gitnexus/` (fork convention) with individual subdirectories per skill (e.g., `gitnexus-cli/SKILL.md`).

#### Scenario: Skill installation
- **WHEN** `gitnexus setup` is run
- **THEN** skill files SHALL be placed under `.agents/skills/gitnexus/<skill-name>/SKILL.md`

### Requirement: Shared Contracts
The system SHALL install Unity-specific shared contracts (runtime-process, hydration, ui-trace, rule-authoring) to `.agents/skills/gitnexus/_shared/`.

#### Scenario: Contract installation
- **WHEN** `gitnexus setup` runs on a Unity project
- **THEN** `unity-runtime-process-contract.md` and related contracts SHALL be installed

### Requirement: Upstream Skill Content
The system SHALL absorb upstream skill content updates (tool descriptions, workflow guidance, schema references) into fork skill files where they don't conflict with fork-specific Unity workflows.

#### Scenario: Skill content merge
- **WHEN** a skill file exists in both fork and upstream versions
- **THEN** the merged skill SHALL include both upstream tool descriptions and fork Unity workflow guidance
