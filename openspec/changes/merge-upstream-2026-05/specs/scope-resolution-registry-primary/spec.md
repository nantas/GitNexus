# Specification Delta

## Capability 对齐（已确认）

- Capability: `scope-resolution-registry-primary`
- 来源: `proposal.md`
- 变更类型: `new`

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## ADDED Requirements

### Requirement: TypeScript Registry-Primary Resolution
The system SHALL use registry-primary scope resolution for TypeScript, resolving symbols through ClassRegistry/MethodRegistry/FieldRegistry lookups rather than suffix-based fuzzy matching.

#### Scenario: Qualified name resolution
- **WHEN** TypeScript code references `userService.getUser()`
- **THEN** the method `getUser` SHALL be resolved via registry lookup on `UserService` class, not fuzzy name matching

### Requirement: C# Registry-Primary Resolution
The system SHALL use registry-primary scope resolution for C#, with 5-pass CaptureMatch → ParsedFile pipeline.

#### Scenario: C# cross-file resolution
- **WHEN** a C# file imports and uses a class from another file
- **THEN** method calls SHALL be resolved through the ScopeResolutionIndex

### Requirement: Python Registry-Primary Resolution
The system SHALL use scope-based call resolution for Python, replacing the old module-level import resolution with registry-primary lookup.

#### Scenario: Python method call
- **WHEN** `models.User(name="test")` is called
- **THEN** the constructor call SHALL be resolved to `User.__init__` in `models` module

### Requirement: Go Scope Resolution
The system SHALL implement scope resolution hooks for Go, including package-level sibling resolution, receiver method alignment, and type binding.

#### Scenario: Go receiver method
- **WHEN** Go code calls `u.GetName()` where `u` is `*User`
- **THEN** the CALLS edge SHALL reference `User.GetName` with correct source ID alignment

### Requirement: Fork Compatibility
The system SHALL preserve fork-specific Unity type inference behavior (Unity synthetic calls, resource binding type propagation) when registry-primary resolution is active.

#### Scenario: Unity synthetic edge after resolution change
- **WHEN** Unity enrichment runs on a repo with registry-primary scope resolution
- **THEN** Unity synthetic edges SHALL still be generated with correct source/target IDs
