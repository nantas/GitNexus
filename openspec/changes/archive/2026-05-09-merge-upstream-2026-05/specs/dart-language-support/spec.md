# Specification Delta

## Capability 对齐（已确认）

- Capability: `dart-language-support`
- 来源: `proposal.md`
- 变更类型: `new`

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## ADDED Requirements

### Requirement: Dart Parsing
The system SHALL parse `.dart` files with the vendored tree-sitter-dart grammar and extract classes, methods, fields, and imports.

#### Scenario: Dart class extraction
- **WHEN** a `.dart` file is parsed
- **THEN** Class and Method nodes SHALL appear in the knowledge graph

### Requirement: Dart Call Patterns
The system SHALL detect Dart-specific call patterns: `await`, cascade (`..`), lambda, and widget-tree contexts.

#### Scenario: Await expression
- **WHEN** a Dart file contains `await service.fetch()`
- **THEN** a CALLS edge SHALL be created from the enclosing method to `service.fetch`
