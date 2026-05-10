# Specification Delta

## Capability 对齐（已确认）

- Capability: `cli-skill-unity-doc`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: `unity-scan-activation` + `cli-skill-unity-doc` 两项，确认通过

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: `unity-project-analyze-best-practice`

The `gitnexus/skills/gitnexus-cli.md` skill SHALL include a Unity project-specific subsection in the `analyze` chapter documenting the recommended parameter combination and explaining why `.meta` SHOULD NOT be included in `--extensions`.

#### Scenario: `unity-recommended-analyze-command`
- **WHEN** an agent reads the CLI skill for Unity project guidance
- **THEN** the skill SHALL show `--extensions .cs` as the recommended extension filter
- **AND** SHALL include `--csharp-define-csproj <path>` as the companion C# preprocessing flag
- **AND** SHALL explain that `.meta` files are handled independently by the Unity scan phase

#### Scenario: `no-meta-in-extensions-explanation`
- **WHEN** the skill documents `--extensions` for Unity projects
- **THEN** it SHALL explain: `.meta` files are GUID metadata consumed by `meta-index.ts` via independent file loading, and including them in `--extensions` causes ~15x more File nodes in the graph without any Unity binding benefit
- **AND** SHALL note the performance impact: ~22min → ~3–5min on a neonspark-scale Unity project

#### Scenario: `skill-content-consistency`
- **WHEN** the skill is updated
- **THEN** the existing "C# preprocessing (Unity)" subsection content SHALL remain unchanged
- **AND** the Unity guidance SHALL be placed in the `--extensions` flag documentation or as a dedicated Unity subsection following it
