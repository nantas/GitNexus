# Specification Delta

## Capability 对齐（已确认）

- Capability: `namespace-siblings`
- 来源: `proposal.md` Modified Capabilities
- 变更类型: modified
- 用户确认摘要: 全部确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: namespace-siblings-derives-from-parsedfile
`populateCsharpNamespaceSiblings` SHALL derive namespace declarations and using-static paths from `ParsedFile.parsedImports` instead of walking the tree-sitter AST.

#### Scenario: namespace-extracted-from-parsedfile
- **WHEN** a C# `ParsedFile` has parsed imports containing `using` directives with namespace scope markers
- **THEN** `populateCsharpNamespaceSiblings` SHALL extract the namespace name from the ParsedFile's module-level scope or parsed imports
- **AND** SHALL NOT call `extractFileStructure` with tree-sitter parser

#### Scenario: file-contents-no-longer-required
- **WHEN** `populateCsharpNamespaceSiblings` extracts namespace info from `ParsedFile` data
- **THEN** it SHALL NOT require `fileContents` map for namespace extraction
- **AND** `CsharpSiblingInputs.fileContents` MAY become optional

#### Scenario: fallback-when-parsedfile-lacks-namespace-info
- **WHEN** a `ParsedFile` does not contain sufficient namespace information in its parsed imports
- **THEN** `populateCsharpNamespaceSiblings` SHALL fall back to the existing tree-sitter AST walk via `extractFileStructure`
- **AND** SHALL log a debug-level warning indicating the fallback

### Requirement: backward-compatible-namespace-extraction
The namespace extraction logic SHALL produce identical cross-file sibling bindings as the current tree-sitter-based implementation.

#### Scenario: identical-bindings-output
- **WHEN** `populateCsharpNamespaceSiblings` runs with the same `ParsedFile[]` input
- **THEN** the `bindingAugmentations` produced SHALL be identical regardless of whether namespace info came from `ParsedFile` data or tree-sitter AST walk
- **AND** the namespace-to-def mapping SHALL match exactly
