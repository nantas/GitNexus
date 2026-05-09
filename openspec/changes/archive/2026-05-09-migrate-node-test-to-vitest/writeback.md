# Writeback: migrate-node-test-to-vitest

## Summary

Migrated all `src/` test files from `node:test` + `node:assert/strict` to unified vitest API (`describe`, `it`, `expect`). Updated `vitest.config.ts` include patterns to cover all migrated files. Removed obsolete `test:src:node` script.

## Writeback Actions

| Target | Action | Status |
|--------|--------|--------|
| `gitnexus/vitest.config.ts` | Top-level include added: `src/benchmark/**/*.test.ts`, `src/cli/**/*.test.ts`, `src/core/**/*.test.ts`, `src/mcp/local/**/*.test.ts` (consolidated). `lbug-db` project includes `src/core/lbug/**/*.test.ts`. | ✓ |
| `gitnexus/package.json` | Removed `test:src:node` script. Updated `test:all` to just `vitest run`. | ✓ |

## Pending Writeback

The writeback for `gitnexus/AGENTS.md`（移除 node:test 相关指引，更新测试框架规范）is deferred — it requires review by repository maintainers to ensure the AGENTS.md test guidance updates align with broader documentation conventions.

## Binding

- Spec standard ref: `repo://gitnexus`
- Project pages: `gitnexus/vitest.config.ts`, `gitnexus/package.json`
- Additional context: `gitnexus/AGENTS.md` (pending update)
