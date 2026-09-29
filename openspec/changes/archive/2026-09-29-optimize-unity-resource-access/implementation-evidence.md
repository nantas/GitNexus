# Implementation evidence

## Pinned starting point

- Date: 2026-09-28. Source HEAD: `8c95b84f9e40fe64ab79b61fa4c172b868bfe642`.
- Runtime: `/Users/nantasmac/.nvm/versions/node/v24.15.0/bin/node` (`v24.15.0`). The shell default Node 26 is not the comparison runtime.
- Target: `/Volumes/Shuttle/unity-projects/neondesign`, HEAD `a0b62e7d32fb9e1539567920421c1a3801cc884f`.
- Target config SHA256: `034c75cf93616340fd077240f85aa58eba778cde91f2ca8af76d24b551084307`.
- Baseline dist resolver SHA256: `8796f66860cb19e5a54ea0ff9fc25f988775dbb5f8b8ed366b4567a82cbf9ff3`.
- Baseline dist scan-context SHA256: `b0620154b42ba22428db7e134b94e922273e8e684e55cbb17c9e68690cdef46f`.
- Working tree inventories: `working-tree-before.txt`, `target-working-tree-before.txt`; dirty target content hashes (45 files): `target-dirty-content.json`. Existing unrelated changes are preserved. Full A/B must recheck content/cache/write plan immediately before execution; HEAD alone does not identify dirty content.
- Historical profiling invocation is in `.scratch/neondesign-perf-20260928-node24/invocation.json`. Its development environment and CPU profiling overhead must not be silently compared to a differently instrumented optimized build.

## Impact / text corroboration

MCP upstream impact on `buildUnityScanContext`, `resolveUnityBindings`, `processUnityResources`, and `hydrateUnityForSymbol` returned UNKNOWN, partial, zero resolved callers. Index is **1756 commits behind HEAD** and has no scope-extraction completeness receipt. These are unresolved graph results, not low-risk findings. No index rebuild was performed.

Exact-path impact on `runFullAnalysis` and `getIndexIncompleteReasons` found no target. An initial unqualified `runAnalyze` lookup resolved the benchmark helper, so that result is excluded from production impact evidence.

Text corroboration of current source:

| Target | Actual consumers / risk boundary |
| --- | --- |
| buildUnityScanContext | Resource processor dependency; hydration dependency; scan-context and processor tests |
| resolveUnityBindings | Resource processor; parity/compact hydration via injected dependency; direct resolver tests |
| processUnityResources | unity-resources phase, following scoped resource walk; injected test implementations must remain compatible or migrate |
| hydrateUnityForSymbol | local-backend query/context paths at 4301/4327/6532/6560; preserve fallback and closure policy |
| runFullAnalysis | CLI analyze, analyze-watch, server analyze worker; metadata changes reach every indexing entry point |
| getIndexIncompleteReasons | CLI status (both forms), MCP resources; resource failures need a persisted receipt/reason, not only a diagnostic string |

Source review confirms existing incompleteness reasons cover scope extraction, embeddings, graph collapse and interrupted incremental writes; none describes resource analysis failure. A minimal resource-specific extension and old-index compatibility tests are needed. No HIGH/CRITICAL verdict was returned. Graph coverage remains unresolved and must be reported during final review.

## Requirement coverage map

All paths below are relative to `gitnexus/`. This table is a coverage plan, not a claim that new behavior already passes.

| Requirement | Implementation locations | Evidence / tests |
| --- | --- | --- |
| TwoStageResourceDiscovery | src/core/unity/scan-context.ts, prefab-source-scan.ts | scan-context.test.ts canonical/scoped/source-only cases; real baseline script |
| ResourceLevelResolutionReuse | new resource session, resolver.ts, ingestion/unity-resource-processor.ts | baseline-resource-access.mjs; resource session multi-script/same-script tests to add |
| PreserveResourceSemantics | resolver.ts, yaml-object-graph.ts, processor | resolver.test.ts local/list/override/AssetRefPath/negative IDs/GUID case; processor serialized-type cases; own-line regression to add |
| BoundedIntermediateWorkingSet | resource session and internal storage | byte-budget, slow consumer, long-line, high-cardinality resource/component tests to add |
| RunScopedTemporaryStorage | session record adapters | memory/spill parity, early return, storage/cleanup faults and ownership tests to add |
| ExplicitResourceCompleteness | session, processor, run-analyze.ts, storage/repo-manager.ts, core/index-freshness.ts | unreadable/changed resource; publication/status; fatal spill tests to add |
| QueryAndPublicationCompatibility | resolver, mcp/local/unity-runtime-hydration.ts, parity seed/publishing | hydration budget/fallback/allowlist, seed and incremental tests |
| ObservableAccessCostAndAcceptance | session metrics, phase diagnostics | source opens/bytes/parses and pending/spill tests; controlled full-build A/B pending |

## Actual discovery baseline

Command: `node openspec/changes/optimize-unity-resource-access/baseline-resource-access.mjs` with the pinned Node 24 and dist hashes above. Result: exit 0; output in `baseline-resource-access.json`.

The script creates and removes its own temporary repository. Two actual scripts and meta GUIDs, one actual resource, three components (First twice, Second once), and scoped discovery/canonical selection are used. It does not inject duplicate hit hints.

| Resource | Discovery opens / bytes | Semantic opens / bytes | YAML parses |
| --- | --- | --- | --- |
| 540-byte small | 1 / 540 | one readFile / 540 | 1, inferred from the inspected getResourceBlocks readFile→parse path |
| 525854-byte large | 1 / 525854 | two streams / 1051708 | 0 full YAML parses; two lightweight passes |

Both preserve all three distinct component identities and external reference GUIDs. Discovery emits one hit per resource/GUID. Actual m_Script lines are 3, 7, 11; First currently returns evidence 3, 3. This confirms both cross-script rereading and the independent evidence-location defect.

The older artificial repeated-hit repro is **defensive input evidence only**, not the analyze baseline. Small-resource cached behavior is explicitly preserved in this comparison; the repeated physical reads occur in the large-resource branch.

## Existing targeted tests

Command (from gitnexus): `node --test --test-timeout=600000 dist/core/unity/resolver.test.js dist/core/unity/scan-context.test.js dist/core/ingestion/unity-resource-processor.test.js`.

Result: **55 passed, 0 failed**, exit 0. Raw output: `baseline-tests.log`. This validates the existing dist baseline, not the planned resource session or an optimized build.

## First implementation slice (not a completed optimization)

- Added resource-level `resolveResourceBindings` iterator to resolver.ts. Selected GUIDs share the same lightweight stream or parsed small-resource objects. The symbol query wrapper now delegates to this parser and deduplicates repeated path hints.
- YAML object parsing and lightweight parsing retain each component's own script line. New small/large negative-stripped-ID and mixed-case GUID tests first failed with `[3,3]` instead of `[3,7]`, then passed after the fix (`evidence-regression-red.log`, `evidence-regression-green.log`).
- New real-discovery tests select two scripts and three instances and assert one semantic source open for both size branches. Existing small-resource local/list/override/AssetRefPath cases and processor serialized-type/canonical cases remain in the targeted suite.
- Additional upstream impact: `createLightweightBindings` was not found; `getResourceBlocks` and `parseUnityYamlObjects` returned UNKNOWN/partial with the same stale index. Text confirms the first two are private resolver helpers; the YAML parser is called by getResourceBlocks and tests.
- This iterator is only a parser seam: analyze is **not yet rewired** to consume resources together. It still exposes the legacy scan context internally; the final session Interface, byte budgets, spill adapters, fused discovery and completeness publication are **not implemented**. One giant component and readline's long-line buffer are still unbounded. Tasks 2.1/2.2 therefore remain open.

Validation against edited source (Node 24):

```
node --import tsx --test --test-timeout=600000 \
  src/core/unity/resource-access.test.ts src/core/unity/resolver.test.ts \
  src/core/unity/yaml-object-graph.test.ts src/core/unity/scan-context.test.ts \
  src/core/ingestion/unity-resource-processor.test.ts
npx tsc --noEmit
```

**62 tests passed**, exit 0 (`unity-targeted-tests.log`); typecheck exit 0 (`typecheck.log`); `git diff --check` passed. No build or full A/B has been performed against these edits.

## Apply pause: full-suite failures

`npm test` was started before implementation and reported four failures in `test/unit/incremental-orchestration.test.ts` (29 tests, 360993 ms):

1. a config-only index missing Spring config evidence rebuilds and restores the scoped stamp
2. adding the first JVM file re-evaluates capabilities after the pipeline and avoids a top-up
3. rewrites unchanged Kotlin Spring bean metadata when same-package shadowing changes
4. a hub edit whose write set covers most of a large repo escalates to the full DB write plan (#2409)

Raw output: `baseline-npm-test.log`. The runner was interrupted via SIGINT after this completed test file reported failures (exit 130); no native worker thread terminate() was used, and no test workers remain. Full assertion details were not printed before interruption. There were also extension-policy warnings in the following suite; these do **not** establish the cause of the four failures.

The suite overlapped parser edits and did not finish: it is neither a clean frozen full-suite baseline nor final validation. Do not attribute these failures conclusively to pre-existing code without isolating them. No unchanged automatic rerun was attempted. Next diagnostic step is to isolate the four named cases with detailed reporting and compare against pinned source if needed, before widening production changes.

At the end of the initial apply turn, apply was paused with 4/24 tasks complete under openspec-apply-change's error-handling instruction. The partial parser implementation is locally tested, uncommitted, and does not yet improve production analyze's cross-script read count. The follow-up investigation below supersedes this pause status.

## 2026-09-29: investigation of the four reported failures

The user authorized continued diagnosis and repair. Source was held unchanged throughout both runs below; Node was pinned to v24.15.0. No production fix was made during this investigation.

1. Isolated the four named tests using:

   ```sh
   npx vitest run test/unit/incremental-orchestration.test.ts \
     -t 'config-only index missing Spring|adding the first JVM|unchanged Kotlin Spring bean|hub edit whose write set' \
     --reporter=verbose --reporter=json \
     --outputFile.json=../openspec/changes/optimize-unity-resource-access/four-failures-before.json
   ```

   Result: **4 passed, 25 skipped**, exit 0, 53.45 seconds. Full text: `four-failures-before.log`; structured assertions: `four-failures-before.json`.

2. Restored the complete file order to test for preceding-test state contamination:

   ```sh
   npx vitest run test/unit/incremental-orchestration.test.ts \
     --reporter=verbose --reporter=json \
     --outputFile.json=../openspec/changes/optimize-unity-resource-access/incremental-before.json
   ```

   Result: **29 passed, none skipped**, exit 0, 314.10 seconds. Full text: `incremental-before.log`; structured assertions: `incremental-before.json`.

Both commands ran from `gitnexus/` with the pinned Node directory prepended to PATH. The second run deliberately changed test selection to include preceding tests; it was not a blind retry of the first command.

**Conclusion:** the four failures did not reproduce either in isolation or in original file order. The original interrupted run overlapped source modifications and did not retain assertion details. Source/build-identity drift is a possible confound, not an established root cause; timing/environmental intermittency has not been ruled out. These observations do not justify altering Spring/Kotlin/incremental production behavior or weakening assertions.

The four-case blocker is no longer reproducible on the current tree. Continue the Unity change from task 2.1, and run the full final validation against a frozen implementation. This is not an all-suite pass and does not complete task 3.3. Future full runs must keep source unchanged, retain verbose/JSON results, and allow the runner to finish reporting assertions before classifying failures.

## Resource-session implementation (2026-09-29)

The user explicitly instructed continuation after the four-case investigation. The following supersedes the earlier partial-parser-only status:

- `UnityResourceSession` exposes selected resources, selected GUIDs, pull consumption, reference-record consumption, failures, costs and close. No mutable parse cache is passed by its callers.
- Analyze consumes bindings in resource order. It no longer accumulates resolvedBySymbol or small-resource YAML caches. Per-resource summaries are emitted after the resource completes (the graph's addRelationship keeps the first ID, so emitting partial summaries would lose binding kinds).
- Analyze opts into fused GUID/prefab-source discovery, retaining the legacy query discovery path. Canonical unique-resource hit counts remain unchanged. Source-only prefab references survive.
- Discovery rows and large-component reference rows use memory/spill storage owned exclusively by the current execution. Replay checks row count and SHA256. Pull iteration gives backpressure; the consumer drains reference records before advancing the component iterator.
- Lightweight source lines retain at most a 256 KiB prefix plus a 64 KiB chunk. Oversized scalar/comment bodies have no default lightweight semantics and are skipped; an unsafe oversized semantic line reports resource failure. Small-resource full YAML remains capped at 512 KiB of input, query deep parsing is explicitly separate.
- Resource fingerprints include device/inode/size/mtimeNs/ctimeNs. Version changes and reads fail explicitly while independent resources continue. Temporary storage failures are fatal.
- Metadata carries `unityResourceFailures`; status exposes `unity-resource-analysis-failed`. A later analyze forces full retry, and skipped derived phases retain the old receipt. Full publication integration validation remains pending.

Impact was refreshed for processUnityResources, buildUnityScanContext, resolveResourceBindings, resolveBindingForComponent, emitPrefabSourceGuidRefsFromScanContext, runFullAnalysis and its actual runFullAnalysisInner helper, and getIndexIncompleteReasons. The stale graph remains UNKNOWN/partial or target-not-found; current-source call-site corroboration is retained. No stale-index rebuild was performed.

Validation:

- `resource-consumption-tests.log`: 44 tests passed after session/processor wiring.
- `fused-discovery-tests.log`: 49 tests passed after fusion/storage wiring.
- `bounded-parser-tests.log`: 48 tests passed.
- `session-budget-tests.log`: 37 tests passed, including a single component with 2000 references, low-budget spill equivalence and oversized scalar/reference handling.
- `session-hydration-tests.log`: 12 tests passed, including actual processor two-read contract, concrete component identities, direct/nested summary union, seed mapping and hydration fallback.
- `npm run build`: exit 0 (`build.log`).
- Expanded built-source suite: `node --test --test-timeout=600000 dist/core/unity/*.test.js dist/core/ingestion/unity*.test.js dist/mcp/local/unity*.test.js`: **166 passed**, 0 failed (`unity-expanded-tests.log`). Includes seed/overlay invalidation, actual resource chain graph facts and runtime-root behavior.
- `npx tsc --noEmit`: exit 0 (`implementation-typecheck.log`).

Performance prototype and frozen acceptance gates: `performance-gates.md`. Frozen old dist and exact 254-edge prototype snapshots are in `.scratch/unity-resource-ab/`. Full npm test and full-build A/B remain pending; neither is implied by the passing targeted suite.

## Final-boundary preparation during the frozen full-suite run

The main source was held unchanged while full `npm test -- --maxWorkers=2` ran. Additional lifecycle/read-bound patches were prepared under `.scratch/unity-resource-ab/pending/` and will be applied only after that process exits, with original-source hashes checked before copying. The full-suite result therefore describes the pre-boundary snapshot, not the final forthcoming fixes.

New-module impact checks (`UnityResourceSession`, `ResourceRecordStore`, `resourceLines`, `discoverUnityResources`, `resourceCosts`) returned target-not-found/UNKNOWN; current source corroborates only Unity scan/session/parser/processor and tests as callers. This is not a graph all-clear.

Target preflight on 2026-09-29 found HEAD `4645c6e8c6357423956cbbd99f1492b4fa67414e`, different from the original pin, and six of the prior 45 dirty-file hashes differ. No target files were edited by this check. Full A/B must use a fresh content manifest, compare each run against it, and must not compare elapsed time against the old report as if inputs were unchanged.

## Boundary fixes and final local validation

Prepared patches were applied only after the frozen full-suite process exited, after verifying all pre-patch source hashes. Additional behavior:

- Source streams support mid-read abort; session close aborts the active stream. Early close removes spilled component records without opening the next resource.
- Cleanup failures are fatal and preserve both the original error and cleanup causes. Store close attempts both handle close and owned-directory removal.
- Missing parseable components for discovered selected GUIDs are explicitly incomplete. Small-branch streaming reads enforce the 512 KiB input bound even after a stale size hint.
- Prefab-source storage closes before semantic resolution; routing hints retain no full source line. Canonical selection and temporary write/replay costs are measured, excluding consumer suspension from replay time. Development logging exposes the full cost summary.
- Real `runFullAnalysis` publication test produces a bad-resource receipt, preserves independent analysis, then fixes the source and verifies plain analyze retries and clears the receipt at unchanged HEAD.

Evidence:

- `boundary-tests.log`: **35 passed**, including real publication/retry and lifecycle fault injection; `boundary-typecheck.log`: exit 0.
- `full-suite.log`: frozen full npm test stopped via parent SIGINT at the 30-minute limit, exit 130. It reported **893 passing files and three failing files**, not a full-suite pass. No native worker thread was terminated.
- `help-failure-isolated.log`: narrowed the single failure to missing Chinese translation for `Repository name in the analysis config` (`--rc-name`), unrelated to Unity runtime behavior. Graph impact for localizeCliHelp was UNKNOWN/not-found; source confirms CLI startup/help consumers only. Added the missing en/zh message pair, leaving command behavior unchanged.
- `help-and-skills-final.log`: **90 passed** across the full CLI help and shipped-skills synchronization files after that fix.
- `remaining-suite.log` / `.json`: ran the 229 files not reported by the bounded full run; **216 passed, 13 skipped; 854 tests passed, 18 skipped**, exit 0. This is split-suite coverage, not a claim that one uninterrupted full command passed. CLI help passed after its correction; two additional failures (C# capture golden snapshot and streaming relationship retention guard) were identified during full log reconciliation and are being isolated. Do not treat aggregate coverage as passing until these are resolved.
- `final-build.log`: build exit 0. `final-typecheck.log`: typecheck exit 0.
- `unity-final-tests.log`: final built Unity/hydration/processor/publication suites **173 passed, 0 failed**, exit 0.
- OpenSpec strict validation and `git diff --check` passed. No commit or archive was performed.

The final lifecycle/parser edits are covered by the final 173-test suite. Most unrelated files in the initial npm run were tested before those last edits; split-suite evidence must retain that distinction.

## Full-log reconciliation and independent snapshot

Reconciliation found two further failures in the initial frozen run: the streaming-retention guard scanned `src/**/*.test.ts` despite its documented production-only scope, and the C# capture fixture walker included ignored `obj/bin` outputs generated by other tests. Isolated output: `additional-failures-isolated.log` (2 failed, 21 passed). The first failure is a test-discovery consequence of the new Unity assertions, not missing production retained edges. The second diff contains generated assembly attributes/info; committed fixture digests were unchanged.

The guard now excludes `*.test.ts`; the C# fixture walker excludes `obj/bin`. No production retention set, C# parser logic or golden expected file was changed. Both test-only targets returned UNKNOWN/not-found from impact; source confirms local test consumers. `additional-failures-fixed.log`: **23 passed**, exit 0. All three failures reported by the bounded full run have thus been explained and verified after specific fixes. Across the split runs all 1125 configured test files were accounted for (1112 passed, 13 skipped); this remains split-run coverage with final Unity behavior independently covered by 173 built tests.

The live target changed again to `3f7889ca26c874482dd76e1743c07244c1fb89a2`. The user was offered snapshot versus holding the live worktree stable; while awaiting a preference, the recommended snapshot was prepared. It is inside the target's ignored `.gitnexus/unity-resource-ab-20260929/repo`, with its own detached Git checkout/index and copied (not hard-linked) scoped code/resources and root csproj files. Snapshot creation started and ended at the same source HEAD.

155443 input files are pinned in `.scratch/unity-resource-ab/snapshot-manifest.json` (every copied file has SHA256). The snapshot retains working-tree source/resource edits, `.gitignore`, `.gitnexusrc`, and an independent copy of the existing parser cache. Out-of-scope binary media are not copied; the configured includeExtensions are `.cs`/`.meta`, and all prefab/scene/asset/UI resources used by Unity enrichment are copied. Each run verifies every input hash before timing and restores the same parser-cache input. The registry alias is `neondesign-unity-resource-ab`; the live target's index is not rebuilt by these measurements.

System volume had only 8.1 GiB free, so the ~6.1 GB source snapshot is stored on Shuttle (551 GiB free), not the system volume. Baseline and optimized use exactly this same path, config, forced-full write plan and monitoring. This replaces the old live-target pin for full A/B and does not introduce any product resource cache.

Benchmark preparation corrections (before any complete measurement):

- Seven case-only path aliases on the target's case-insensitive HFS+ volume made concurrent snapshot copy/hash interleave. The snapshot file content matched the original, but one preflight hash was the empty-file digest. The manifest was regenerated after copying, aliases deduplicated to 155436 physical paths, and the snapshot harness now deduplicates before copying. No product files were changed for this correction.
- The frozen baseline dist initially lacked package runtime siblings. Two startup-only failures (4.38 s and 1.68 s, before analysis) are retained in `.scratch/unity-resource-ab/baseline-startup-missing-vendor/` and `baseline-startup-missing-hooks/`. The baseline package now links unchanged vendor/hooks/scripts/skills and dependencies from the installed source package. Import smoke checks of baseline `core/run-analyze.js` and `cli/analyze.js` pass. Resolver/scan-context frozen hashes remain unchanged. These are preparation failures, not completed A/B results.

A final startup preflight found that Git's ignored-file filtering had omitted generated root csproj files. All 83 root csproj files were explicitly copied (alongside the already selected nested csproj files), producing a final **155519-path** content manifest. `resolveAnalysisInputs` against the snapshot passed with fingerprint `fdc132a5b2ba73773573409ac30ce8df2a5f4be0713572bf8fb2dc74a693cf65`. The 1.95-second pre-analysis failure is preserved as `baseline-startup-missing-csproj/`. No source analysis completed during these startup attempts. The actual baseline subsequently reached parsing.

The preload's `process.memoryUsage().heapUsed` samples also run in inherited worker isolates. The reported sampled heap maximum is the highest per-isolate heapUsed sample, not the sum of all JavaScript heaps. RSS and `/usr/bin/time -l` peak memory footprint separately cover whole-process memory. Both variants use exactly the same sampler; no threshold is changed.

## User-directed benchmark target change: neonnew

The user explicitly asked to test neonnew because neondesign is in use. The neondesign snapshot run was stopped with SIGINT (exit 130 after 234.311 s), before completion; evidence is retained under `neondesign-snapshot-interrupted/` and is **not** used as an accepted baseline. Only the temporary snapshot and its copied cache created by this task were removed; the live neondesign project/index was not rebuilt.

Repo registry resolves neonnew to `/Users/nantasmac/projects/neonnew`. Its AGENTS.md and CLI guidance were read; no target code/asset edits, worktree, Unity Editor operation or platform change is involved. The repository context reports the old `neonspark` index 197 commits stale; the user's test authorization covers these analyses. `.gitnexusrc` selects `Assets/`, `Packages/`, `.cs/.meta`, `Assembly-CSharp.csproj`; the existing index records the same selection and zero embeddings.

Final A/B target pin: HEAD `a9b2894c67ee9087bf2c2e984a356ca7e5135f97`, 155513 input paths (including ignored root csproj), manifest `.scratch/unity-resource-ab/neonnew-manifest.json`, SHA256 `c6798e8d9cc7150090f17ff814bbd01aa124f91638930b71434c4bd1faba977a`. Resolved analysis input fingerprint: `9b1aec0df399ac745487cf94bb04544159ec0d090c4e9f3b87c53cc9ed707c22`.

Both variants run `analyze --force --index-only --verbose --no-parse-cache --name neonnew-unity-resource-ab` with the same pinned Node/V8 flags. This deliberately gives both runs the same cold parser policy rather than letting the second benefit from the first's cache. Isolated `GITNEXUS_STORAGE_PATH=/Volumes/Shuttle/gitnexus-unity-resource-ab-20260929/neonnew-index` and `GITNEXUS_HOME=.../home` keep benchmark DB, cache and registry on the spacious Shuttle volume and preserve the normal neonnew index/registry. Storage preflight reports `missing`, and the C# input preflight passes.

The sampler now also records threadId/isMainThread for both final variants, allowing separate main-isolate and highest-isolate heap observations. Numeric acceptance gates remain unchanged.

## neonnew 完整基线因系统盘压力中止（2026-09-29 13:05 CST）

- 用户指定 neonnew 后，固定 155513 路径清单、冷 parser cache、独立外置索引/registry，基线实际完成 Unity 资源阶段：655593 ms。
- 总运行至 960569 ms 时，系统盘可用空间从约 8 GiB 降至约 200 MiB；系统 swap 从 30057 MiB 上升至最高 42986 MiB。索引位于外置盘，但系统 swap 位于内置盘。为了避免系统盘耗尽，向本次 /usr/bin/time 进程组发送 SIGINT，CLI 正常显示 Interrupted — cleaning up，退出码 1。
- 采样主 isolate peak heapUsed 12669170416 bytes；maxRSS 5850087424 bytes；peak memory footprint 22580362896 bytes。完整指标见 neonnew-interrupted-measurement.json，原始日志仍在 .scratch/unity-resource-ab/complete-baseline/。
- 中止时正在创建数据库 FTS，尚未发布 unity-parity-seed.json。因此不作为成功完整基线，不能比较总耗时或宣称完整语义相等。优化版尚未开始。
- 已请求用户释放内置盘空间或关闭不用的高内存应用；不清理无关 .scratch/upstream-merge-1.6.12（约 42 GiB），不修改 neondesign。完整 A/B 任务 3.4 仍未完成，数值门槛不调整。

### 中止后环境恢复与本 session 清理

- 对 neonnew 再次完整枚举并逐文件 SHA256：155513 路径清单与原始清单逐字节一致；原索引 gitnexus.json 哈希与工作树 porcelain 也保持一致。重复核验清单在确认一致后删除，哈希写入 cleanup-20260929.json。
- 按用户要求审计本 session 文件：Unity 工作临时产物约 142 MiB，未发现多 GiB 本次遗留。删除上述重复清单并压缩两份废弃 neondesign 输入清单，gzip 解压后逐字节验证，总释放 75541161 bytes（约 72 MiB）。旧清单路径现为 .json.gz；基线 dist、原始日志与原型关系证据保留。
- .scratch/upstream-merge-1.6.12 为 9 月 22 日起的其他工作，约 42 GiB，未清理。系统 temp 目录整体约 330 MiB，未删除归属不明文件。
- 基线退出后系统自行回收交换文件，可用空间先恢复约 15 GiB，随后约 25 GiB。给后续测量增加系统盘低于 2 GiB 时 SIGINT 中止的保护；开始优化版完整构建。之前中断的基线仍不计作验收成功。

### 用户追加授权清理旧上游验收产物

用户明确要求清理约 42 GiB 上游合并验收产物中未被 Git 追踪的内容。核对主仓追踪列表为空，但发现三个 fixture 嵌套 Git 仓库，共 12 个追踪文件；将全部 12 个追踪路径及 .git 元数据排除在清理外（其中 3 个 fixture 路径原已处于删除状态，保持原状；已核验无追踪路径位于任何删除条目下），其余 134 个未追踪条目已删除，目录降至约 1.7 MiB，系统盘约 77 GiB 可用。清单见 .scratch/unity-resource-ab/upstream-artifact-cleanup.json。清理发生于第一轮优化版解析阶段；该轮只能作为诊断测量，完整公平时间比较需在清理后的稳定条件下重新配对。

### 清理后测量推进

第一轮优化版完整退出 0：总 wall 601327 ms，Unity phase 234305 ms，resource-failures 0，peak sampled isolate heap 2275567232 bytes、maxRSS 3239936000 bytes、footprint 12720636520 bytes。输入清单再次重算完全一致；已导出 352780 条具体关系与 seed（complete-optimized 下 gzip 证据）。由于解析期间发生旧产物清理，该轮为诊断结果，不直接视作公平 A/B 验收。

中断基线已完整保留至 .scratch/unity-resource-ab/neonnew-baseline-disk-interrupted/；其原 complete-baseline 路径由清理后的新基线复用。新基线运行时没有其他本任务的测试/清理/编译，保持 30 分钟上限与新增磁盘 2 GiB 保护。原始诊断指标见 neonnew-diagnostic-measurements.json。

### 清理后完整基线及初次语义核验

完整基线退出 0：wall 786176 ms，Unity phase 533882 ms，未触发磁盘保护。导出 352780 条关系（source/target/type/reason/confidence/step 归一化精确事实），与第一轮优化版全部 SHA256 多重集合相同，无差异；完整 seed JSON 深比较相同，包含 10270 个 canonical symbol、8523 个 script GUID、2860 个 guid→resource 列表、19399 个 asset GUID 映射，prefabSourceRefs 均为空。证据为 diagnostic-semantic-comparison.json 及两版 gzip 事实。随后补跑无清理干扰的优化版，旧优化诊断输出单独保留。

## 最终技术验收（2026-09-29）

正式优化版退出 0：wall 512561 ms，Unity phase 243398 ms，采样主 isolate peak heap 2062855328 bytes。与有效基线配对的所有预设数值门槛通过，具体内存、CPU、系统压力及环境限制见 performance-results.md / neonnew-final-measurements.json。

最终导出 352780 条规范化关系与基线全部相同，seed 深比较完全相同，metadata resourceFailures 为空。运行后重新枚举 155513 路径清单 SHA256 不变，neonnew 原索引 metadata 哈希及工作树状态不变；证据见 neonnew-final-semantic-comparison.json。

本轮没有追加生产代码变更，沿用最终 build/tsc 及 173 项 Unity 用例的验证。测试全量分批覆盖限制保留。任务 3.4、3.6、4.1、4.2 完成；4.3 等待用户对具体外部回写文本授权。没有提交、发布或归档，提交前仍须 graph detect_changes，不把陈旧索引检查当作 clean。

## 授权收口 2026-09-29T13:55:11+08:00

用户明确授权回写、归档并整理提交。已核验外部目标最新内容，仅在支撑轨道三新增唯一 handoff 条目并回读核验，链接指向最终归档路径。主规范新增 8 requirements / 22 scenarios，严格校验通过。提交前 detect_changes(all) 返回 medium、8 symbols、3 resolver processes，无 partial/truncated 标志；陈旧图不能证明新增符号完整覆盖，结合已有源码补证及全量/业务测试判断。无 HIGH/CRITICAL 风险返回。原始响应见 precommit-graph.json。

提交前专项 npm test：4 个文件、113 项通过；npx tsc --noEmit 退出 0；diff --check 与 change/spec 严格校验通过。原始输出见 precommit-tests.log / precommit-typecheck.log。归档保留 .openspec.yaml，主规范已同步；所有 24 项任务完成。
