# Specification Delta

## Capability 对齐（已确认）

- Capability: `namespace-names-in-parsed-file`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `new`
- 用户确认摘要: 用户确认了 capability 清单

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## ADDED Requirements

### Requirement: ParsedFile Exposes Namespace Names

The `ParsedFile` interface SHALL expose an optional `namespaceNames` field containing the namespace name strings declared in the file.

#### Scenario: File declares a named namespace

- **WHEN** a C# source file contains `namespace Foo.Bar { ... }` or `namespace Foo.Bar;`
- **THEN** `parsedFile.namespaceNames` SHALL include `"Foo.Bar"`
- **THEN** The namespace name SHALL be the full dotted name as written in the source (qualified name, not last segment only)

#### Scenario: File with no namespace declaration

- **WHEN** a C# source file has no `namespace` declaration
- **THEN** `parsedFile.namespaceNames` SHALL be `undefined` or an empty array

#### Scenario: File declares multiple namespaces

- **WHEN** a C# source file contains multiple `namespace X { }` blocks
- **THEN** `parsedFile.namespaceNames` SHALL include each in source order

### Requirement: Namespace Names Are Captured During Scope Extraction

The C# scope extractor (`emitCsharpScopeCaptures`) SHALL capture the namespace name string from each `@scope.module` capture's `name:` child node and surface it through the bridge.

#### Scenario: Scope extractor visits namespace declarations

- **WHEN** the scope extractor processes a C# file with `namespace X.Y.Z`
- **THEN** it SHALL read the `name` child node of the `namespace_declaration` or `file_scoped_namespace_declaration` node
- **THEN** it SHALL store the full dotted name text (`"X.Y.Z"`)

### Requirement: IPC Serialization of Namespace Names

The `ParseWorkerResult` type SHALL carry namespace names so they are available in the main process after worker pool execution.

#### Scenario: Worker sends ParsedFile to main thread

- **WHEN** a worker thread outputs a `ParsedFile` with `namespaceNames` populated
- **THEN** the names SHALL survive `postMessage()` serialization (JSON-compatible)
- **THEN** the main process SHALL receive the same `namespaceNames` array

### Requirement: Backward Compatibility

Existing consumers of `ParsedFile` SHALL NOT break when `namespaceNames` is `undefined`.

#### Scenario: ParsedFile without namespaceNames

- **WHEN** a non-C# language produces a `ParsedFile` without `namespaceNames`
- **THEN** no runtime error SHALL occur
- **THEN** consumers SHALL treat `undefined` as "no namespace information available"
