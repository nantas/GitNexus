# Specification Delta

## Capability 对齐（已确认）

- Capability: `namespace-siblings-perf`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: 用户确认了 capability 清单

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: deriveCsharpFileStructure Uses ParsedFile Namespace Names

`deriveCsharpFileStructure` SHALL check `parsedFile.namespaceNames` before attempting a tree-sitter AST walk. When namespace names are available from the ParsedFile, the function SHALL NOT call `getCsharpParser().parse()` or recurse the AST.

#### Scenario: ParsedFile has namespaceNames

- **WHEN** `parsedFile.namespaceNames` is a non-empty array
- **THEN** `deriveCsharpFileStructure` SHALL return `{ namespaces: parsedFile.namespaceNames, ... }` without invoking tree-sitter
- **THEN** The returned `namespaces` array SHALL match the source declaration order

#### Scenario: ParsedFile has no namespaceNames (fallback)

- **WHEN** `parsedFile.namespaceNames` is `undefined` or empty
- **AND WHEN** `inputs.fileContents` has content for the file
- **THEN** `deriveCsharpFileStructure` SHALL fall back to the existing tree-sitter AST walk (preserving current behavior)

#### Scenario: No file content and no namespaceNames

- **WHEN** `parsedFile.namespaceNames` is `undefined` AND `inputs.fileContents` has no entry for the file
- **THEN** `deriveCsharpFileStructure` SHALL return `{ namespaces: [], usingStaticPaths: [] }` (same as existing behavior)

### Requirement: usingStaticPaths Still Requires AST Walk

`using static` path extraction SHALL still use the tree-sitter AST walk when file content is available, regardless of `parsedFile.namespaceNames`.

#### Scenario: File has using static directives

- **WHEN** a file contains `using static Foo.Bar.Logger;`
- **THEN** `deriveCsharpFileStructure` SHALL still extract `usingStaticPaths` via the full tree-sitter AST walk
- **THEN** The `namespaces` array MAY be returned from `parsedFile.namespaceNames` even though the AST walk also runs for `usingStaticPaths`
- **Note**: This means we still call `extractFileStructureWithFallback` when `using static` paths need extraction, but ONLY when such paths exist. If no `using static` directives are present, the AST walk is skipped entirely.

### Requirement: Performance Regression Gate

The `namespaceSiblings` sub-stage SHALL NOT exceed 1 second for 3046 C# files after this change.

#### Scenario: 3046-file benchmark

- **WHEN** running analyze on `Assets/NEON/Code/Game` (3046 files)
- **THEN** `namespaceSiblings` duration SHALL be < 1000ms (baseline: 29,333ms before fix)
