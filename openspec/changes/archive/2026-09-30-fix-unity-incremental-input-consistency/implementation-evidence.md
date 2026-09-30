# Implementation evidence

Source baseline: `1666e83ee433f7461fff6028afdf74ec4b5f50b2`. Node 24.15.0, npm build produces local dist. Existing `.pi/`, `.scratch/` and `benchmarks/fixtures/unity-mini` changes are unrelated and retained. This describes the implementation baseline before the 2026-09-30 archive/commit closeout below; no index refresh or external writeback was performed.

Original neonnew evidence: design.md records target HEAD, the 155,513-path manifest digest, cold/warm/noop timings and concrete missing facts. Raw logs remain in `.scratch/neonnew-warm-rebuild-20260929/`; no-change exit 0 was a semantic failure, not a passing baseline.

## Graph impact and source corroboration

Apply-time upstream impact for `runFullAnalysisInner`, `walkRepositoryPaths`, `RepoMeta`, `computeFileHashes`: UNKNOWN (missing targets or partial/no callers); graph is 1,757 commits behind. This is unresolved graph coverage, not LOW risk. No stale index rebuild was attempted. Source confirms `runFullAnalysis` invokes the inner orchestrator; scanner is consumed by scan phase and freshness checks; RepoMeta is actually defined in repo-meta.ts and re-exported by repo-manager.ts. Hashing is consumed by orchestration and freshness. Existing scanner/hash functions are not edited; new validation lives in Unity input module. Only shared orchestration and optional metadata receipt change.

## Input audit

- Source selection: glob dot=false with `createIgnoreFilter`, scope and includeExtensions. Receipt conservatively includes large candidate sources and declaration companions (extra invalidations are safe).
- Resource selection: prefab/unity/asset, static ignore plus scope, independent of source size cap and extension selection. The existing reader's empty-scopedPaths fallback is covered rather than silently changing it.
- Script/resource metadata: inferred `.meta` paths, including newly appearing sidecars. Empty-resource fallback includes repository-wide metadata as its readers do.
- C# namespace/project scan: `.cs` and `.csproj`, dot directories included; excludes node_modules/.git/bin/obj, regardless of source scope or Git ignores. Receipt conservatively covers beyond the reader's BFS depth/count caps.
- Razor component reader: source-ignore-filtered `.cshtml` paths (even if extension selection excludes them).
- Unity configuration: lifecycle reads repo `.gitnexus/config.json`; payload selection also reads invocation-cwd `.gitnexus/config.json`. Both are covered, deduplicating in-repo absolute paths. The normalized `GITNEXUS_DISABLE_PREFAB_SOURCE_PASS` boolean is included. No external rule file is read by this ingestion phase; query/hydration rules are unchanged.
- Controls: `.gitnexusrc`, .gitignore, .gitnexusignore, Git global excludes/info exclude, configured external csharpDefineCsproj, effective options/size cap/ignore environment. Existing analyzer identity, schema/features, semantic-input fingerprints and recovery gates precede reuse.
- Mixed source languages: external configuration closure has not been established, so receipt is not reusable; full staged builds remain available.
- Failure boundary: glob's swallowed readdir errors are captured; streaming hash failures reject the whole snapshot; content is revalidated before publication. This detects observed changes, not arbitrary concurrent changes reverted between checks.

## Requirement coverage

| Requirement | Implementation | Evidence/tests |
| --- | --- | --- |
| CompleteAnalysisInputSnapshot | Unity analysis-input-snapshot | unit content/add/large/scope/project/config tests |
| FinalOutputInventory | run-analyze final inventory / refreshed deferred diff | real CLI final File inventory and hashes |
| UnchangedInputReuse | receipt gate before pipeline | full → two ordinary dirty runs, no heavy-stage logs |
| SafeUnityChangeRebuild | Unity forces staged graph rebuild; embedding mode preserved | ordinary vs force facts for source/resource/GUID mutations |
| IncompleteInputsAreNotDeletions | strict traversal + bounded reads + prepublish revalidation | missing/read/permission, incomplete replacement, mid-run mutation and final rename failure tests |
| ReceiptMigrationAndPublication | version 1, success-only metadata publication | legacy receipt repair, failure tests |
| CompatibilityAndObservability | prior guards retained, reasons/timing, non-Unity path | incremental orchestration suite, no-Unity unit |
| SemanticAndPerformanceAcceptance | real CLI facts/seed/inventory | four neonnew runs passed; see benchmark.md |

## Commands and results

All npm commands run in gitnexus with Node 24.15.0 on PATH.

- `npx vitest run test/integration/unity-input-consistency.test.ts` (baseline dist): expected FAIL, missing concrete Unity resource relations and 7 resource hashes after ordinary analyze. `.scratch/unity-input-regression-red.log`.
- First implementation build + same regression: PASS, `.scratch/unity-input-regression-green.log` (1 test, 7.03s).
- Snapshot unit first run: 4 passed, 1 failed because glob treated absent literal Assets directory as enumeration error. Fixed by root-based discovery; this was a test-discovered implementation defect.
- At this intermediate point, extended mutation tests and shared regression checks were still pending. Early command path typos produced no source edit; corrected before recording test results.

- `npx vitest run test/integration/unity-input-consistency.test.ts` extended mutations: PASS (60.09s), `.scratch/unity-input-mutations.log`. Source/resource edit, add/rename/delete and GUID mutation each compared to force by concrete facts/ordered members, hashes and complete seed. Legacy receipt migration and permission failure covered.
- `npx vitest run test/integration/unity-input-consistency.test.ts test/unit/unity-input-snapshot.test.ts test/unit/shipped-skills-sync.test.ts`: 3 files / 75 tests PASS (79.91s), `.scratch/unity-input-publication.log`. Added real prepublish content mutation and injected final rename failure; prior graph/seed/inventory/receipt retained, recovery succeeds.

- Shared incremental target run: 44 passed, 2 failed (539.48s), `.scratch/unity-input-targeted.log`. Both failures are `Analyzer build or dependency runtime changed during analysis`; implementation edits overlapped source-identity checks. Source/dist frozen before the full-suite rerun; this failed run is not counted as a pass.
- Final build passed (`.scratch/unity-input-build-final3.log`); `npx tsc --noEmit` passed (`.scratch/unity-input-tsc-final.log`).
- Six compiled Unity suites (`resource-publication`, `resource-session`, `resource-access`, `resource-hit-scanner`, `scan-context`, `resolver`), Node test concurrency 1, isolated GITNEXUS_HOME: 52 passed / 0 failed, 7.869s (`.scratch/unity-input-node-tests.log`).
- Early neonnew trial under `.scratch/neonnew-input-consistency-20260929` stopped intentionally with SIGINT/exit 130 after 71.404s to add incomplete-replacement protection. Not a successful result or formal timing sample. Final measurements use a new isolated directory and pinned source/dist hashes.

- Full-suite diagnostics: the pre-existing `source-control-bytes` failure is `openspec/changes/archive/2026-09-29-optimize-unity-resource-access/neonnew-working-tree-before.txt`. A byte scan found 44 NUL bytes in both the working copy and `git show HEAD:<path>`; contents are byte-identical. This is the archived NUL-delimited Git status evidence, not a new source regression. Preserved rather than rewriting historical evidence to make the check green.
- The old merge-review Unity test expected selective incremental writes. Updated only its write-plan assertions/title to the approved full-write policy; its persistent runtime-root add/retain/remove assertions remain. File impact target absent (UNKNOWN); actual consumer is Vitest. Targeted rerun subsequently passed all 4 merge-review cases.

- Full `npm test -- --maxWorkers=2` ended at the documented 1,800-second bound (exit 124), `.scratch/unity-input-full-test-result.json`. No complete-suite pass is claimed. Immediate failure reports identified the old Unity write-plan assertion, baseline archived NUL evidence, and a new fixture assertion; the last two task-owned assertions were diagnosed, not silently retried.
- `unity-input-final-regression.log`: updated merge-review regression 4/4 passed. New canonical assertion failed because the fixture used a differently named file, while existing selection prioritizes an exact filename match over resource hit count. Changed fixture to two `PlayerActor.cs` files in different directories and asserted the persisted seed's actual selected path. Serialized-type assertion already passed. No production canonical algorithm changed.
- `npx vitest run test/integration/unity-input-consistency.test.ts test/unit/unity-input-snapshot.test.ts --reporter=verbose`: final expanded acceptance PASS, 2 files / 6 tests, 79.12s (`.scratch/unity-input-acceptance.log`). Includes canonical switch, serialized type facts, clean ignored resource, cache bypass, readable-but-unresolvable replacement, read failure, mid-analysis mutation and rename failure.

## Final local verification

- Stable-source rerun of the two analyzer-identity failures: 2 passed / 27 intentionally skipped, 39.25s (`.scratch/unity-input-stable-identity-rerun.log`). The prior failures occurred while implementation files changed, not on frozen source.
- Final `npm run build` and `npx tsc --noEmit`: PASS (`.scratch/unity-input-build-pinned.log`, `.scratch/unity-input-tsc-pinned.log`).
- Final `npx vitest run test/unit/unity-input-snapshot.test.ts test/integration/unity-input-consistency.test.ts --maxWorkers=1`: 2 files / 7 tests PASS, 83.55s (`.scratch/unity-input-tests-pinned.log`). Includes the added invocation-cwd configuration and normalized prefab-source environment switch coverage.
- Source/dist then frozen for all four formal neonnew measurements. Cold/warm/noop/noop2: 754.104 / 691.188 / 45.237 / 36.504 seconds. See [benchmark](benchmark.md) for exact hashes, command flags, complete phase/memory/system-pressure measurements, semantic equality, untouched publication checks and normal-project preservation.
- Full suite remains **not green / incomplete**: the bounded run timed out at 1,800 seconds and contains the baseline archived NUL failure. Focused passes do not replace a complete suite pass. No automatic full-suite retry or rewrite of historical evidence was performed.
- CLI skill mirrors and runtime shared contracts were synchronized; the shipped-skills check was included in the passing 75-test batch. No CLI argument, query/hydration interface, setup injection or hook contract changed.
- At implementation completion no commit/archive had been performed. The 2026-09-30 user request authorizes archive and a scoped commit; pre-commit checks are recorded below. Unrelated existing worktree changes remain intact.

- Final coverage audit added real CLI combinations for `incrementalInProgress` and an interrupted foreign embedding checkpoint while the input receipt still matches. The former rebuilds and preserves facts; the latter fails at the existing identity gate without generating embeddings or replacing the graph, retaining its pending marker. Rerun: 1/1 comprehensive CLI test PASS, 55.31s (`.scratch/unity-input-recovery-acceptance.log`). Production source/dist unchanged after the formal benchmark. File impact via dist CLI returned UNKNOWN/not found for this new test; actual consumer is Vitest. The documented `.gitnexus/run.cjs` wrapper is absent here, so the built CLI was used without an index rebuild.

## Archive and commit closeout (2026-09-30)

- User authorized archiving and a scoped commit, and cancelled external writeback. Task 4.3 is closed as cancelled, not as an executed write. Main spec synchronized: 8 requirements / 19 scenarios; strict spec validation passed.
- Installed root tooling with `npm ci --ignore-scripts` using the existing lockfile; dependency declarations and lockfile unchanged. Repository ESLint/Prettier applied to the six changed TypeScript files: 0 lint errors / 24 warnings. These final formatting changes postdate the benchmark; historical benchmark source/dist hashes remain the original measurement pins.
- Rebuilt formatted sources: `npm run build` and `npx tsc --noEmit` passed. `npm test -- test/unit/unity-input-snapshot.test.ts test/integration/unity-input-consistency.test.ts test/integration/merge-review-regressions.test.ts test/unit/shipped-skills-sync.test.ts --maxWorkers=1`: 4 files / 80 tests passed, 103.84s. Logs: `.scratch/unity-archive-build.log`, `.scratch/unity-archive-tsc.log`, `.scratch/unity-archive-tests.log`.
- Pre-commit `detect_changes(scope: all)` ran after staging: 34 changed files, 0 resolved symbols/processes, no partial/truncated flag. The index is 1,757 commits stale: the reported low risk / zero symbols is not a clean safety conclusion. No index rebuild was performed. Scoped diff review and the focused regression checks supplement this unresolved graph coverage limitation.
- Commit scope includes implementation, tests, synchronized CLI skills/contracts, archived change, main spec, and the next-round handoff in `docs/plans/2026-09-30-unity-full-build-optimization-handoff.md`. Existing `.pi/`, `.scratch/`, and benchmark fixture changes are excluded. `git diff --check` passed.
- The prior full-suite timeout and baseline NUL failure remain unresolved; no complete-suite pass is claimed. No external writeback or push is part of this closeout.
