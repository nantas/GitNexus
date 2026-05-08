# Specification Delta

## Capability 对齐（已确认）

- Capability: `docker-deployment`
- 来源: `proposal.md`
- 变更类型: `new`
- 用户确认摘要: 全选进行

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## ADDED Requirements

### Requirement: Dockerfile Delivery
The system SHALL include working `Dockerfile.cli` and `Dockerfile.web` at the repository root, capable of building the CLI/server and web UI as container images.

#### Scenario: CLI image build
- **WHEN** `docker build -f Dockerfile.cli .` is executed
- **THEN** a runnable container image SHALL be produced

#### Scenario: Web image build
- **WHEN** `docker build -f Dockerfile.web .` is executed
- **THEN** a runnable container image containing both gitnexus server and web UI SHALL be produced

### Requirement: Docker Compose Orchestration
The system SHALL include a `docker-compose.yaml` that starts the gitnexus server with the web UI in a single command.

#### Scenario: Compose up
- **WHEN** `docker compose up` is executed at repo root
- **THEN** the gitnexus server SHALL become reachable on the configured port

### Requirement: Health Endpoint
The server SHALL expose a dedicated `/health` endpoint for container health checks, distinct from the main API routes.

#### Scenario: Health check probe
- **WHEN** a GET request is sent to `/health`
- **THEN** the response SHALL be 200 OK when the server is healthy
