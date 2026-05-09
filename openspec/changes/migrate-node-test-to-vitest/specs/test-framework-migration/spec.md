# Specification Delta

## Capability 对齐（已确认）

- Capability: `test-framework-migration`
- 来源: `proposal.md` Capabilities → New
- 变更类型: new
- 用户确认摘要: 已通过拆分方案确认，`migrate-node-test-to-vitest` 为最高优先级 change

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## ADDED Requirements

### Requirement: Unified Test Framework
All test files in the repository SHALL use vitest as the sole test framework. Imports of `node:test` and `node:assert/strict` SHALL NOT exist in any `.test.ts` file.

#### Scenario: No node:test imports remain
- **WHEN** a developer runs `grep -r "node:test" --include="*.test.ts" src/`
- **THEN** no matches are found

#### Scenario: No node:assert imports remain
- **WHEN** a developer runs `grep -r "node:assert" --include="*.test.ts" src/`
- **THEN** no matches are found

### Requirement: Vitest API Replacement
Every test file previously using `node:test` SHALL be migrated to use vitest API equivalently:
- `import test from 'node:test'` → `import { describe, it } from 'vitest'`
- `import assert from 'node:assert/strict'` → use vitest `expect()` matchers
- `test('name', () => {})` → `it('name', () => {})`
- `test.skip('name', ...)` → `it.skip('name', ...)`
- `test.only('name', ...)` → `it.only('name', ...)`

#### Scenario: Synchronous assertion migration
- **WHEN** a test contains `assert.strictEqual(a, b)`
- **THEN** it is replaced with `expect(a).toBe(b)`

#### Scenario: Deep equality assertion migration
- **WHEN** a test contains `assert.deepStrictEqual(a, b)`
- **THEN** it is replaced with `expect(a).toEqual(b)`

#### Scenario: Truth/falsy assertion migration
- **WHEN** a test contains `assert.ok(value)` or `assert(value)`
- **THEN** it is replaced with `expect(value).toBeTruthy()`

#### Scenario: Exception assertion migration
- **WHEN** a test contains `assert.throws(() => fn())` or `assert.rejects(promise)`
- **THEN** it is replaced with `expect(() => fn()).toThrow()` or `expect(promise).rejects`

#### Scenario: Subtest structure migration
- **WHEN** a test file contains `test('parent', async (t) => { await t.test('child', ...) })` (node:test subtests)
- **THEN** the parent becomes `describe('parent', () => {` and children become `it('child', ...)`

### Requirement: Vitest Config Coverage
The `vitest.config.ts` include patterns SHALL cover all migrated test files in `src/` so that `npm test` discovers and runs them.

#### Scenario: src/benchmark tests included
- **WHEN** a developer runs `npm test`
- **THEN** test files matching `src/benchmark/**/*.test.ts` are discovered and executed

#### Scenario: src/cli tests included
- **WHEN** a developer runs `npm test`
- **THEN** test files matching `src/cli/**/*.test.ts` are discovered and executed

#### Scenario: src/core tests included
- **WHEN** a developer runs `npm test`
- **THEN** test files matching `src/core/**/*.test.ts` are discovered and executed

#### Scenario: src/mcp/local tests fully covered
- **WHEN** a developer runs `npm test`
- **THEN** all test files matching `src/mcp/local/**/*.test.ts` are discovered and executed (expanding beyond existing partial patterns)

### Requirement: Mechanical Migration Only
The migration SHALL be mechanical and SHALL NOT change the semantic behavior of any test assertion. Failed tests SHALL remain failed with the same assertion errors after migration.

#### Scenario: Semantic preservation
- **WHEN** a test was failing before migration due to a missing function or wrong output
- **THEN** after migration, the same test still fails with an equivalent assertion error (not a framework import error)

### Requirement: Workspace Partitioning Preserved
The existing vitest workspace structure (projects: `lbug-db`, `default`, `cli-e2e`) SHALL be preserved. LadybugDB test files SHALL remain in the `lbug-db` project with `fileParallelism: false`.

#### Scenario: lbug-db workspace unchanged
- **WHEN** LadybugDB-related test files are migrated
- **THEN** they remain in the `lbug-db` workspace configuration with sequential execution
