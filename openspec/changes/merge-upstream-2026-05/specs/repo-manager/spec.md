# Specification Delta

## Capability 对齐（已确认）

- Capability: `repo-manager`
- 来源: `proposal.md` / Modified Capabilities
- 变更类型: `modified`
- 用户确认摘要: 全选进行

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: Repo Alias Support
The system SHALL support registering indexed repositories with a user-defined alias via `--name <alias>`, enabling cross-repo references without path coupling.

#### Scenario: Alias registration
- **WHEN** `gitnexus analyze --name core-lib` is run
- **THEN** the repo SHALL be registered as `core-lib` in the registry

### Requirement: GITNEXUS_HOME Customization
The system SHALL honor the `GITNEXUS_HOME` environment variable to customize the global gitnexus directory location.

#### Scenario: Custom home directory
- **WHEN** `GITNEXUS_HOME=/custom/path` is set
- **THEN** registry, config, and global state SHALL be stored under `/custom/path`

### Requirement: Windows Path Hardening
The system SHALL use case-insensitive path matching on Windows and normalize path separators across platforms when resolving repository roots.

#### Scenario: Windows path match
- **WHEN** the same repo is referenced with `C:\Projects\Repo` and `c:\projects\repo`
- **THEN** both SHALL resolve to the same registry entry

### Requirement: Config File Permission Hardening
The system SHALL validate and harden permissions on config files (`.mcp.json`, `opencode.json`) during setup, preserving existing comments and structure.

#### Scenario: Config file merge
- **WHEN** `gitnexus setup` writes to an existing `.mcp.json`
- **THEN** existing comments and non-gitnexus entries SHALL be preserved
