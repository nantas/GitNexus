# Specification Delta

## Capability 对齐（已确认）

- Capability: `ingestion-pipeline`
- 来源: `proposal.md` / Modified Capabilities
- 变更类型: `modified`
- 用户确认摘要: 全选进行

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: Pipeline Phases
The system SHALL execute ingestion in a DAG-based phase architecture that includes both upstream phases (call extraction, heritage, import processing, route extraction) and fork phases (scope filtering, extension filtering, Unity resource scanning, Unity enrichment).

#### Scenario: Full pipeline with Unity stages
- **WHEN** analyze is run on a Unity project with `--unity-bindings`
- **THEN** the pipeline SHALL execute Unity-specific stages after standard ingestion stages, producing synthetic edges in the graph

### Requirement: Scope Filtering
The system SHALL filter files and symbols by scope path when `--scope` is provided, applying the filter at the filesystem walker stage before parsing.

#### Scenario: Scoped file walk
- **WHEN** `--scope Assets/Scripts` is provided
- **THEN** only files under that directory SHALL be queued for parsing

### Requirement: Extension Filtering
The system SHALL support extension-based include/exclude filtering for non-standard file extensions (`.uxml`, `.uss`, `.prefab`, `.unity`, `.asset`).

#### Scenario: Unity extension inclusion
- **WHEN** analyze runs on a Unity project
- **THEN** `.prefab`, `.unity`, `.asset`, `.uxml`, `.uss` files SHALL be included for resource scanning

### Requirement: Route Extraction
The system SHALL extract HTTP route definitions from Express, Next.js, FastAPI, and Spring frameworks as a pipeline phase, producing ROUTE nodes and HANDLES edges.

#### Scenario: Next.js route extraction
- **WHEN** a Next.js project with `app/api/` route handlers is analyzed
- **THEN** ROUTE nodes SHALL appear in the graph linked to their handler functions

### Requirement: DAG Execution
The system SHALL execute pipeline phases as a directed acyclic graph with parallel fan-out where phases have no dependencies on each other.

#### Scenario: Parallel parsing and resource scanning
- **WHEN** analyze runs on a Unity project
- **THEN** C# parsing and Unity resource scanning MAY execute in parallel
