# Specification Delta

## Capability 对齐（已确认）

- Capability: `cobol-language-support`
- 来源: `proposal.md`
- 变更类型: `new`

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## ADDED Requirements

### Requirement: COBOL File Detection
The system SHALL detect `.cbl`, `.cob`, `.cpy` files and route them to the COBOL regex extraction pipeline.

#### Scenario: COBOL repo analyze
- **WHEN** `gitnexus analyze` is run on a repo containing COBOL source files
- **THEN** COBOL symbols SHALL appear in the knowledge graph with correct node types

### Requirement: COBOL Copy Expansion
The system SHALL expand `COPY` statements in COBOL sources to resolve cross-file references.

#### Scenario: COPY statement resolution
- **WHEN** a `.cbl` file contains `COPY UTIL.`
- **THEN** references from `UTIL.cpy` SHALL be resolved and edges created
