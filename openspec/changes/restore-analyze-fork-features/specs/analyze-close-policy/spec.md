# Specification Delta

## Capability 对齐（已确认）

- Capability: `analyze-close-policy`
- 来源: `proposal.md` / New Capabilities
- 变更类型: `new`
- 用户确认摘要: 全选确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## ADDED Requirements

### Requirement: Force Process Exit on Success
The system SHALL call `process.exit(0)` at the end of a successful analyze run to ensure clean termination despite native modules (LadybugDB, ONNX Runtime) holding open handles that prevent the Node.js event loop from draining.

#### Scenario: Successful analyze exits cleanly
- **WHEN** `gitnexus analyze` completes successfully (all phases pass)
- **THEN** the system SHALL call `process.exit(0)` after the summary output
- **AND** the exit code SHALL be 0

#### Scenario: Analyze fails before completion
- **WHEN** `gitnexus analyze` encounters an error during pipeline execution
- **THEN** the system SHALL NOT call `process.exit(0)`
- **AND** the exit code SHALL reflect the error (non-zero)

### Requirement: Close Policy Does Not Affect Error Paths
The close policy SHALL only apply to the success path. Error paths SHALL use the existing error propagation mechanisms (`cliError`, `process.exitCode = 1`, `return`).

#### Scenario: RegistryNameCollisionError
- **WHEN** a `RegistryNameCollisionError` is thrown
- **THEN** the system SHALL set `process.exitCode = 1` and `return`
- **AND** `process.exit(0)` SHALL NOT be called

#### Scenario: Pipeline runtime error
- **WHEN** the pipeline throws an unexpected error
- **THEN** the catch handler SHALL log the error and set a non-zero exit code
- **AND** `process.exit(0)` SHALL NOT be called

### Requirement: Close Policy Comment
The `process.exit(0)` call SHALL be accompanied by a comment explaining why it is necessary:

```
// LadybugDB's native module holds open handles that prevent Node from exiting.
// ONNX Runtime also registers native atexit hooks that segfault on some
// platforms (#38, #40). Force-exit to ensure clean termination.
```

#### Scenario: Code review discovers the force exit
- **WHEN** a developer reads the analyze success path
- **THEN** they SHALL see an explanatory comment justifying the `process.exit(0)` call
- **AND** understand that removing it will cause the process to hang
