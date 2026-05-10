# Specification Delta

## Capability 对齐（已确认）

- Capability: `test-timeout-config`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: 已确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: hook-timeout-single-run
The `vitest.config.ts` SHALL set a `hookTimeout` value sufficient for the single global setup LadybugDB schema DDL execution, preventing timeout termination during the import phase.

#### Scenario: global setup completes without timeout
- **WHEN** `vitest run` is executed
- **THEN** `hookTimeout` MUST be at least 180000 (180 seconds) to allow the global setup LadybugDB schema creation to complete without being killed

### Requirement: test-timeout-lbug-pool
The lbug-db pool's serial file execution MUST have a `testTimeout` value sufficient for the cumulative execution time of all serialized files, preventing premature timeout termination.

#### Scenario: lbug-db pool completes successfully
- **WHEN** `vitest run` executes the lbug-db pool with `fileParallelism: false`
- **THEN** `testTimeout` in the lbug-db project config MUST be at least 300000 (300 seconds)

### Requirement: default-pool-fast-feedback
The default pool SHALL retain its existing 30000ms `testTimeout`, ensuring fast failure feedback for developers.

#### Scenario: unit test timeout
- **WHEN** a unit test in the default pool hangs
- **THEN** it SHALL be terminated after 30000ms (30 seconds)
