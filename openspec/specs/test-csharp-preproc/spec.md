# Specification Delta

## Capability 对齐（已确认）

- Capability: `test-csharp-preproc`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: 已确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: remove-stale-symbol-table-import
The test SHALL NOT import from a module path that no longer exists in the codebase.

#### Scenario: parse-worker-csharp-preproc.test.ts — module resolution
- **WHEN** the test file is loaded by vitest
- **THEN** all import paths MUST resolve to existing `.ts` or `.js` files
- **THEN** the import from `../../src/core/ingestion/symbol-table.js` MUST be removed (the file `symbol-table.ts` no longer exists)
- **THEN** if `createSymbolTable` is no longer used, remove the entire test file or replace with a simpler test that does not depend on deleted modules
