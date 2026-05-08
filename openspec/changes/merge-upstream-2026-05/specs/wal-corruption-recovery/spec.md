# Specification Delta

## Capability 对齐（已确认）

- Capability: `wal-corruption-recovery`
- 来源: `proposal.md`
- 变更类型: `new`

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## ADDED Requirements

### Requirement: WAL Quarantine
The system SHALL detect WAL file corruption on database open and quarantine the corrupted `.wal` file instead of crashing.

#### Scenario: Corrupted WAL on startup
- **WHEN** the database is opened and the `.wal` file is found to be corrupted
- **THEN** the corrupted `.wal` SHALL be moved to a quarantine path and the database SHALL open with the last committed state

### Requirement: Checkpoint Before Close
The system SHALL execute a CHECKPOINT before closing the embedding database to prevent WAL corruption.

#### Scenario: Graceful shutdown
- **WHEN** the server or analyze process shuts down
- **THEN** a CHECKPOINT SHALL be issued before the database connection is closed

### Requirement: Safe Close Helper
The system SHALL provide a consolidated `safeClose` helper that flushes WAL and closes the database handle atomically.

#### Scenario: Connection teardown
- **WHEN** any database connection is being closed
- **THEN** the `safeClose` helper SHALL flush pending writes and release the handle without leaking
