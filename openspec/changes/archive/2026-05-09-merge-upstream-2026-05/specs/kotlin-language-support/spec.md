# Specification Delta

## Capability 对齐（已确认）

- Capability: `kotlin-language-support`
- 来源: `proposal.md`
- 变更类型: `new`

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## ADDED Requirements

### Requirement: Kotlin Parsing
The system SHALL parse `.kt` files with tree-sitter-kotlin and extract classes, methods, fields, and imports.

#### Scenario: Kotlin class extraction
- **WHEN** a `.kt` file contains `class User(val name: String)`
- **THEN** a Class node for `User` SHALL appear in the graph

### Requirement: Kotlin Null-Check Narrowing
The system SHALL narrow types after null checks in Kotlin (e.g., `if (x != null)` narrows `String?` to `String`).

#### Scenario: Smart cast after null check
- **WHEN** a method call follows a null check on the receiver
- **THEN** the CALLS edge SHALL reference the narrowed (non-nullable) type's method

### Requirement: Kotlin Extension Detection
The system SHALL support Kotlin extension detection and annotation processing (`data class`, `object`, `companion object`).

#### Scenario: Data class fields
- **WHEN** a `data class User(val name: String, val age: Int)` is parsed
- **THEN** fields `name` and `age` SHALL be extracted with correct types
