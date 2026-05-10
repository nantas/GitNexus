# Specification Delta

## Capability 对齐（已确认）

- Capability: `unity-scan-activation`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: `unity-scan-activation` + `cli-skill-unity-doc` 两项，确认通过

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: `unity-scan-activates-on-csharp-classes`

The `unityScanPhase` SHALL activate (invoke `processUnityResources()`) when the graph contains C# Class nodes with `.cs` file paths, even when `allPaths` contains no Unity resource extensions (`.prefab`, `.unity`, `.asset`). The existing extension-based gate on `allPaths` is a fast-path optimization but SHALL NOT be the sole activation condition.

#### Scenario: `extensions-cs-only-activates-unity-scan`
- **WHEN** user runs `gitnexus analyze --extensions .cs` on a Unity project
- **AND** `allPaths` contains only `.cs` files (no `.prefab/.unity/.asset/.meta`)
- **THEN** `unityScanPhase` SHALL detect C# Class nodes in the graph
- **AND** SHALL call `processUnityResources()` to produce UNITY_* edges and lifecycle synthetic CALLS

#### Scenario: `non-unity-project-skips`
- **WHEN** user runs `gitnexus analyze` on a non-Unity project (no `.cs` files with Unity-typical patterns)
- **AND** `allPaths` contains no Unity resource extensions
- **THEN** `unityScanPhase` SHALL skip and return `{ hasUnityFiles: false }`
- **AND** no `processUnityResources()` call is made

#### Scenario: `extensions-cs-meta-still-activates-via-existing-gate`
- **WHEN** user runs `gitnexus analyze --extensions .cs,.meta`
- **AND** `allPaths` contains `.meta` files
- **THEN** the existing extension-based gate SHALL still activate (`.meta` remains part of the secondary check)
- **AND** the new C# class check is redundant but harmless

### Requirement: `meta-removed-from-unity-extensions-set`

The `.meta` extension SHALL be removed from the `UNITY_EXTENSIONS` Set in `unity-scan.ts`, because `.meta` files are GUID metadata (consumed by `meta-index.ts` via independent `glob`) and do NOT produce Unity graph edges (UNITY_COMPONENT_INSTANCE, UNITY_ASSET_GUID_REF, UNITY_SERIALIZED_TYPE_IN, UNITY_RESOURCE_SUMMARY).

#### Scenario: `meta-not-counted-as-unity-file`
- **WHEN** `unityScanPhase` filters `allPaths` for Unity files
- **THEN** `.meta` files SHALL NOT be included in `unityFiles`
- **AND** `unityFileCount` SHALL NOT count `.meta` files

### Requirement: `backward-compatible`

The fix SHALL NOT change behavior for existing configurations. When `.meta`, `.prefab`, `.unity`, or `.asset` files ARE in `allPaths` (whether from `--extensions` or from no filter), the existing extension-based gate SHALL still work as before.

#### Scenario: `no-extensions-flag-work-as-before`
- **WHEN** user runs `gitnexus analyze` without `--extensions` on a Unity project
- **THEN** all Unity resource files appear in `allPaths`
- **AND** the extension-based gate activates as before
- **AND** the new C# class check adds no overhead beyond a trivial graph scan
