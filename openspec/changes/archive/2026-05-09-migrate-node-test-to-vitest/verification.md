# Verification: migrate-node-test-to-vitest

## Capability: test-framework-migration

## Spec-to-Implementation Coverage

### R1: Unified Test Framework

| Scenario | Method | Result |
|----------|--------|--------|
| No node:test imports remain | `grep -r "node:test" --include="*.test.ts" src/` | ✓ Zero matches |
| No node:assert imports remain | `grep -r "node:assert" --include="*.test.ts" src/` | ✓ Zero matches |

### R2: Vitest API Replacement

| Scenario | Implementation | Result |
|----------|---------------|--------|
| Sync assertions (assert.equal → expect().toBe()) | 全部 80+ 个文件已迁移 | ✓ |
| Deep equality (assert.deepEqual → expect().toEqual()) | 全部文件已迁移 | ✓ |
| Truthy assertions (assert.ok → expect().toBeTruthy()) | 全部文件已迁移 | ✓ |
| Exception assertions (assert.throws → expect().toThrow()) | 20+ 个含 throws 的文件已迁移 | ✓ |
| Rejection assertions (assert.rejects → expect().rejects) | 15+ 个含 rejects 的文件已迁移（含 regex 匹配和纯 rejects） | ✓ |
| Subtest structure (t.test → describe + it) | Batch 1 中含 mock 子测试已迁移 (vi.spyOn + afterEach) | ✓ |

### R3: Vitest Config Coverage

| Scenario | Implementation | Result |
|----------|---------------|--------|
| src/benchmark tests included | `src/benchmark/**/*.test.ts` added to top-level include | ✓ |
| src/cli tests included | `src/cli/**/*.test.ts` added to top-level include | ✓ |
| src/core tests included | `src/core/**/*.test.ts` added to top-level include | ✓ |
| src/mcp/local fully covered | Consolidated from 3 partial patterns to `src/mcp/local/**/*.test.ts` | ✓ |

### R4: Mechanical Migration Only

All migrated files retain their original assertion semantics. No test logic, test cases, or test structure was modified beyond API substitution. Pre-existing failures (csv-generator.test.ts: FileContentCache import issue) remain with equivalent errors.

### R5: Workspace Partitioning Preserved

`lbug-db` workspace remains with `fileParallelism: false`. Added `src/core/lbug/**/*.test.ts` to `lbug-db` project include. `default` project excludes these files.

## Batch Migration Results

| Batch | Directory | Files | Status |
|-------|-----------|-------|--------|
| B1 | src/mcp/local | 13 | ✓ All 192 tests pass |
| B2 | src/core/unity | 19 | ✓ tsc clean |
| B3 | src/core/ingestion + src/core/lbug | 8 | ✓ tsc clean |
| B4 | src/cli | 14 | ✓ tsc clean |
| B5 | src/benchmark | 34 | ✓ tsc clean (1 pre-existing error: neonspark-full-e2e) |
| Config | vitest.config.ts | 1 | ✓ include patterns updated |
| **Total** | **All batches** | **~89 files + config** | **All migrated** |

## Pre-existing Failures (not caused by migration)

- `src/core/lbug/csv-generator.test.ts`: `FileContentCache is not a constructor`, `toCodeElementCsvRow is not a function`
- `src/benchmark/u2-e2e/neonspark-full-e2e.test.ts`: `Property 'failedGate' does not exist on type 'E2ERunResult'`

## Writeback Targets

1. `gitnexus/vitest.config.ts` — Updated include patterns ✓
2. `gitnexus/AGENTS.md` — Remove node:test guidance, update test framework spec to unified vitest
3. `gitnexus/package.json` — Removed `test:src:node` script ✓
