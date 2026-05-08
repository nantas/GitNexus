# Specification Delta

## Capability 对齐（已确认）

- Capability: `clean-command-config-preserve`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: 用户确认移除 clean 命令对 sync-manifest.txt 的特殊保留逻辑

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## REMOVED Requirements

### Requirement: preserve-sync-manifest-on-clean
**Reason**: sync-manifest.txt 文件本身已不再被系统使用，无需保留
**Migration**: 用户不再需要 sync-manifest.txt 文件；所有配置通过 meta.json.analyzeOptions 管理

## MODIFIED Requirements

### Requirement: clean-removes-entire-gitnexus-directory
The `clean` command SHALL remove the entire `.gitnexus/` directory (including any residual `sync-manifest.txt` files from previous versions).

#### Scenario: clean-removes-all-contents
- **GIVEN** a repository with `.gitnexus/` containing index files, `meta.json`, and `sync-manifest.txt`
- **WHEN** the user runs `gitnexus clean --force`
- **THEN** the entire `.gitnexus/` directory SHALL be removed
- **AND** the repo SHALL be unregistered from the global registry

#### Scenario: clean-idempotent-when-no-gitnexus
- **GIVEN** a repository without a `.gitnexus/` directory
- **WHEN** the user runs `gitnexus clean --force`
- **THEN** the command SHALL succeed without error
