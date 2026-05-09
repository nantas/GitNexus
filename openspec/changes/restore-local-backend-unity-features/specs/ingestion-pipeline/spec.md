# Specification Delta

## Capability 对齐（已确认）

- Capability: `ingestion-pipeline`
- 来源: `proposal.md` / Modified Capabilities
- 变更类型: `modified`
- 用户确认摘要: ✅ 三项全选确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: Unity Resource Scanning Phase
The system SHALL add a Unity resource scanning phase to the DAG-based pipeline that processes `.prefab`, `.unity`, `.asset`, `.uxml`, `.uss`, and `.meta` files to build a Unity asset reference index.

#### Scenario: prefab resource scan
- **WHEN** analyze is run on a Unity project
- **THEN** the pipeline SHALL include a phase that scans `.prefab` files for component references using `prefabSourceScan()`
- **AND** scanned references SHALL be stored as `UNITY_COMPONENT_INSTANCE` edges in the graph

#### Scenario: scene file resource scan
- **WHEN** analyze runs on a Unity project with `.unity` scene files
- **THEN** the pipeline SHALL scan scene files for GameObject hierarchies and component references
- **AND** produce `UNITY_COMPONENT_INSTANCE` and `UNITY_SERIALIZED_TYPE_IN` synthetic edges

#### Scenario: asset file resource scan
- **WHEN** analyze runs on a Unity project with `.asset` ScriptableObject files
- **THEN** the pipeline SHALL scan asset files for serialized field references using `serialized-type-index`
- **AND** produce `UNITY_SERIALIZED_TYPE_IN` edges linking asset fields to C# types

### Requirement: Unity Enrichment Phase
The system SHALL add a Unity enrichment phase in the DAG pipeline that correlates Unity resource bindings with the main code graph, producing cross-reference edges between C# code symbols and Unity assets.

#### Scenario: code-to-resource cross-reference
- **WHEN** the enrichment phase executes after community detection
- **THEN** it SHALL cross-reference C# MonoBehaviour classes with their corresponding `.prefab`/`.unity` component references
- **AND** SHALL produce synthetic edges that form the basis for runtime-context queries

### Requirement: Pipeline Phase Registration
The system SHALL register Unity resource scanning and enrichment as optional DAG phases, enabling them only when Unity-specific flags or file extensions are detected.

#### Scenario: conditional Unity phases
- **WHEN** the analyzed project contains `.unity`, `.prefab`, or `.asset` files
- **THEN** Unity phases SHALL be automatically enabled in the DAG
- **AND** SHALL execute after the standard call-extraction and heritage phases, but before community detection
- **AND** phases SHALL be skipped if no Unity files are detected

### Requirement: Extension Filtering for Unity Asset Types
The system SHALL support inclusion of non-standard file extensions (`.prefab`, `.unity`, `.asset`, `.uxml`, `.uss`, `.meta`) for Unity-specific processing while excluding them from standard source-code parsing.

#### Scenario: Unity asset extension handling
- **WHEN** `filesystem-walker` encounters `.prefab`, `.unity`, or `.asset` files
- **THEN** they SHALL be routed to the Unity resource scanner rather than the general code parser
- **AND** they SHALL NOT be fed to tree-sitter parsing phases
