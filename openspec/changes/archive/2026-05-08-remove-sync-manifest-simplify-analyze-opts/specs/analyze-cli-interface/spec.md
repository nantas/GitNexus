# Specification Delta

## Capability 对齐（已确认）

- Capability: `analyze-cli-interface`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: 用户确认移除 `--sync-manifest-policy`、`--scope-manifest`、`--scope-prefix` 三个 CLI 参数

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## REMOVED Requirements

### Requirement: sync-manifest-policy-option
**Reason**: sync-manifest 机制整体移除
**Migration**: 不再需要 drift guard 策略控制

### Requirement: scope-manifest-option
**Reason**: 不再支持 manifest 文件作为参数来源
**Migration**: 用户通过 `--extensions` 和其他 CLI 参数直接指定

### Requirement: scope-prefix-option
**Reason**: scope rules 来源简化，不再支持 `--scope-prefix` 作为独立参数
**Migration**: scope rules 将从 meta.json.analyzeOptions 复用或由用户在首次 analyze 时通过 prompt/skill 指导设定

## MODIFIED Requirements

### Requirement: analyze-command-options
The `analyze` command SHALL accept the following options only:

- `--force`: Force full re-index
- `--no-reuse-options`: Do not reuse stored analyze options
- `--embeddings`: Enable embedding generation
- `--extensions <list>`: Comma-separated file extensions
- `--repo-alias <name>`: Repository alias
- `--csharp-define-csproj <path>`: C# DefineConstants .csproj path
- `--skills`: Generate skill files
- `--verbose`: Verbose output

The following options SHALL NOT be accepted:
- `--sync-manifest-policy`
- `--scope-manifest`
- `--scope-prefix`

#### Scenario: analyze-rejects-removed-options
- **WHEN** the user runs `analyze --sync-manifest-policy update`
- **THEN** the CLI SHALL report an unknown option error

#### Scenario: benchmark-rejects-removed-options
- **WHEN** the user runs `benchmark-unity --scope-manifest foo.txt`
- **THEN** the CLI SHALL report an unknown option error

#### Scenario: analyze-accepts-all-remaining-options
- **WHEN** the user runs `analyze --force --embeddings --extensions .cs,.ts --repo-alias my-repo --csharp-define-csproj /path/to.csproj --skills --verbose`
- **THEN** all options SHALL be accepted and parsed correctly
