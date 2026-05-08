# Specification Delta

## Capability 对齐（已确认）

- Capability: `group-workspace-extractors`
- 来源: `proposal.md`
- 变更类型: `new`

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## ADDED Requirements

### Requirement: Workspace Extractor Dispatch
The system SHALL auto-discover workspace/monorepo boundaries for Node (package.json workspaces), Python (pyproject.toml), Go (go.mod), Java (pom.xml/gradle), and Elixir (mix.exs).

#### Scenario: Node workspace detection
- **WHEN** a repo contains `package.json` with `"workspaces": ["packages/*"]`
- **THEN** each workspace member SHALL be identified as a separate service

#### Scenario: Python workspace detection
- **WHEN** a repo contains `pyproject.toml` with `[tool.hatch.envs]` sections
- **THEN** each environment-defined package SHALL be detected

### Requirement: Contract Extraction
The system SHALL extract cross-service contracts from workspace extractors, including HTTP routes, gRPC service definitions, and shared type modules.

#### Scenario: HTTP route extraction
- **WHEN** workspace members define Express/FastAPI/Spring routes
- **THEN** cross-service HTTP consumer/producer edges SHALL be created
