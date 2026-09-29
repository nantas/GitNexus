# Performance acceptance gates (fixed before complete A/B)

2026-09-29. These gates follow the real resource phase prototype and precede the full baseline/optimized runs.

## Prototype

Frozen baseline: `.scratch/unity-resource-ab/baseline/dist`; optimized: `gitnexus/dist`.
Harness: `.scratch/unity-resource-ab/phase-prototype.mjs`, Node v24.15.0, actual neondesign BattleModeHud.prefab plus its canonical script/meta selection.

- 62 canonical symbols sharing 58 distinct script GUIDs, 871949-byte resource.
- Baseline 3094.46 ms; optimized 631.92 ms (79.6% lower).
- All 254 graph relationships compare exactly, including reason payloads.
- End-of-phase heapUsed: 51,452,816 → 28,032,056 bytes (not peak heap).
- Process maxRSS: 146864 → 143488 KiB (small reduction; do not extrapolate to complete builds).

## Chosen defaults and memory ownership

- Discovery records: 4 MiB retained-string budget, with per-record overhead allowance; excess records spill to an exclusively owned temporary directory.
- Lightweight component references: 1 MiB retained-string budget, separately spillable. Only one component is active; the consumer must drain its references before requesting another binding.
- Source stream chunk: 64 KiB. Retained lightweight line prefix: 256 KiB. Oversized irrelevant scalar/comment bodies are discarded; lines whose semantic content cannot be safely skipped produce an explicit resource failure.
- Small YAML branch: at most 512 KiB of source per resource; parsed objects are released with that resource. Query legacy deep parsing remains outside this analyze bound.
- There is no asynchronous result queue. Pull iteration supplies backpressure. Discovery is sequential and semantic resolution is sequential; concurrency is not a substitute for budgets.
- Necessary GUID/canonical/resource routing maps remain global. Final graph reason payloads are assembled by the graph consumer and belong to final graph memory, not a hidden parser result cache. Prefab-source deduplication keys are released at resource boundaries; one resource's unique edge keys remain consumer state.
- The above are distinct bounded categories, not a claim of a 5 MiB whole-process limit. Temporary record encoding and one decoded row add bounded transient allocation. No new cross-run cache exists.

## Complete build acceptance

Run serially with the same Node flags and monitoring; do not overlap tests/compilation with either run. Use the same target content/config, forced full DB write plan and parser cache policy. Record parse-cache hits, pressure/swap and native memory footprint so unequal conditions remain visible.

Required:

1. Both runs finish successfully within 30 minutes each.
2. No new resource failures. Compare concrete Unity graph identities and reason payloads; explain any intentional evidence corrections. Graph counts alone are insufficient.
3. Unity-resource phase elapsed time falls by at least 20%.
4. Total analyzer elapsed time falls by at least 10%.
5. Sampled peak heapUsed falls by at least 10%. Separately report maxRSS and peak memory footprint; a rise above 10% in either requires investigation rather than claiming an unqualified memory win.
6. If uncontrolled external memory pressure/cache differences invalidate the comparison, label it inconclusive and do not mark full A/B complete.

These gates are acceptance criteria, not measured full-build results.

## Measurement clarification before complete-build results

The preload sampler is inherited by parser workers. `heapUsed` is per V8 isolate; report the maximum sampled isolate heapUsed, not an invented sum or whole-process heap claim. Whole-process RSS and peak memory footprint remain separate required observations. Both variants use identical sampling and the original 10% heap gate.

Because the live target kept changing, complete A/B uses a fixed copy of its scoped working-tree inputs on the same Shuttle volume, with the same parser-cache input restored before each variant. The final manifest pins 155519 paths including ignored root csproj inputs. Runtime, config, source contents and write plan are identical within the pair; the historical live-target report is not the baseline.

## User-directed final target (supersedes snapshot preparation)

The user selected `/Users/nantasmac/projects/neonnew` while neondesign remains in use. The incomplete neondesign snapshot run was cancelled and is excluded from acceptance. The final pair uses neonnew HEAD `a9b2894c67ee9087bf2c2e984a356ca7e5135f97`, its 155513-path content manifest, identical `--force --no-parse-cache --index-only` policy, and the same isolated external storage and registry. Both final samplers record thread identity. All numeric gates above remain fixed.
