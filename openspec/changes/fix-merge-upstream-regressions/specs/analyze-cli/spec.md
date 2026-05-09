# Specification Delta

## Capability 对齐（已确认）

- Capability: `analyze-cli`
- 来源: `proposal.md` Capabilities → Modified
- 变更类型: modified
- 用户确认摘要: 已通过拆分方案确认，--skip-git CLI 旗标行为回归需修复

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: Skip-Git Flag Behavior
The CLI `analyze` command SHALL accept `--skip-git` and `--skip-agents-md` flags. When `--skip-git` is passed, analyze SHALL treat the current working directory as the index root without walking up to a parent git repository. When `--skip-agents-md` is passed, analyze SHALL skip AGENTS.md/skill generation.

#### Scenario: --skip-git indexes non-git directory
- **WHEN** a developer runs `gitnexus analyze <non-git-dir> --skip-git`
- **THEN** the directory is successfully indexed without requiring a `.git/` directory

#### Scenario: --skip-git does not walk up to parent repo
- **WHEN** a developer runs `gitnexus analyze --skip-git` from a subdirectory within a git repository
- **THEN** only the current directory's files are indexed, not the parent repository

#### Scenario: --skip-agents-md suppresses skill generation
- **WHEN** a developer runs `gitnexus analyze --skip-agents-md`
- **THEN** AGENTS.md and skill files are not generated during the analyze run
