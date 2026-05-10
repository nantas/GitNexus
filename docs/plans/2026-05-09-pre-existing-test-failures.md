# Pre-Existing Test Failures

> Generated: 2026-05-09
> Scope: `test/unit/`, `src/cli/`, `src/mcp/` (vitest, all pools)
> Baseline: `chore/merge-upstream-2026-05` (before remove-rule-lab change)

## Summary

| Metric | Count |
|--------|-------|
| Failed test files (default pool) | 9 |
| Failed test files (all pools) | 27 |
| Failed tests (all pools) | 108 |

These failures are pre-existing on the `chore/merge-upstream-2026-05` branch and are **not** caused by the `remove-rule-lab` change.

## Failed Test Files (default pool)

| # | File | Description |
|---|------|-------------|
| 1 | `src/cli/ai-context.test.ts` | `generateAIContextFiles with global scope skips repo skill install` |
| 2 | `src/cli/benchmark-agent-safe-query-context.test.ts` | `runtime retrieval contract docs remove heuristic mode and pin full as debug-only` |
| 3 | `src/cli/setup.test.ts` | `setup --cli-version pins MCP package spec and persists it in config` |
| 4 | `test/unit/ai-context.test.ts` | 2 failed tests: AGENTS.md/CLAUDE.md block preservation |
| 5 | `test/unit/parse-worker-csharp-preproc.test.ts` | C# preprocessor worker pool parse failure |
| 6 | `test/unit/repo-manager-alias.test.ts` | `registerRepo stores alias and rejects collisions` |
| 7 | `test/unit/setup-codex.test.ts` | 2 failed tests: codex MCP add invocations |
| 8 | `test/unit/setup-jsonc.test.ts` | 18 failed tests: JSONC preservation across all MCP configs |
| 9 | `test/unit/setup.test.ts` | 10 failed tests: setupClaudeCode path/wrapper detection |

## Failed Test Files (cli-e2e pool)

All files from default pool + `cli-e2e` pool failures match the same 9 files (duplicate due to pool-based parallel execution).

## Failed Test Files (lbug-db pool)

All files from `lbug-db` pool failures match the same 9 files as default pool.

## Characteristics

- **Setup/config tests dominate** (6 of 9 files): `setup.test.ts`, `setup-jsonc.test.ts`, `setup-codex.test.ts`, `setup.test.ts` (src/cli), `ai-context.test.ts`, `benchmark-agent-safe-query-context.test.ts`
- **Likely cause**: Environment-specific issues with temp directory writes, `.claude.json` detection, and `which gitnexus` PATH resolution
- **CSharp preprocessor**: `parse-worker-csharp-preproc.test.ts` is likely a pre-existing tree-sitter or test fixture issue
- **Repo manager**: `repo-manager-alias.test.ts` alias collision check may be dependent on test isolation order

## Verification

Confirmed via: `npx vitest run test/unit/ src/cli/ src/mcp/` on clean branch `chore/merge-upstream-2026-05`:
- Before change: 27 files / 108 tests failed
- After change: 27 files / 108 tests failed (zero regression)
