# NeonAbyss2 Real-Repo Unity Benchmark Landing Design

Date: 2026-02-28
Status: validated design
Scope: Build and operationalize a real-repository Unity benchmark baseline for NeonAbyss2 in GitNexus

## 1. Context

Current Unity benchmark infrastructure is complete and merged, but it is still centered on `unity-mini` fixture data. The blocked item is Phase 1.5 closure criteria for real-repo validation: calibrate thresholds on NeonAbyss2 data and pass three consecutive full regressions.

The team has already aligned on these decisions:

1. First baseline scope is a curated subset of folders selected by the owner.
2. Only `.cs` files are included in benchmark input.
3. Most samples come from `Assets/NEON/Code`, with a smaller portion from package/plugin code.
4. Dataset authoring starts with manual whitelist selection, but candidate extraction should be script-assisted.
5. Rollout cadence is two-stage: 20 symbols first, then expand to 50 symbols.
6. First full report is allowed to fail; its purpose is gap discovery and threshold calibration.

## 2. Goals and Non-Goals

Goals:

1. Create an independent real-repo dataset at `benchmarks/unity-baseline/neonabyss2-v1/`.
2. Make benchmark input reproducible via a fixed subset fixture synced from NeonAbyss2 using directory whitelist.
3. Run first `benchmark-unity --profile full` against real data and archive report artifacts.
4. Expand to stable threshold calibration workflow (`20 -> 50 -> 3 consecutive full passes`).

Non-goals (v1):

1. Full-repo indexing for baseline gating.
2. Automatic threshold tuning.
3. Multi-root indexing architecture work (Phase 3).
4. Module-definition work (Phase 4).

## 3. Chosen Strategy

Recommended strategy: `symbol-first` dataset construction with reproducible fixture sync.

Why this strategy:

1. It minimizes time-to-first-report.
2. It keeps business-priority control with human selection.
3. It avoids getting blocked by relation graph completeness before first signal arrives.

Alternatives considered but not chosen:

1. Relation-first authoring: better impact coverage but slower startup cost.
2. Task-first authoring: closest to user-facing behavior but hardest consistency maintenance.

## 4. Dataset and Fixture Layout

### 4.1 Dataset root

`benchmarks/unity-baseline/neonabyss2-v1/`

Required files:

1. `thresholds.json`
2. `symbols.jsonl`
3. `relations.jsonl`
4. `tasks.jsonl`

Additional operational files:

1. `sync-manifest.txt` (one directory per line, relative to NeonAbyss2 repo root)
2. `symbols.candidates.jsonl` (script output, read-only)
3. `symbols.selected.txt` (human selection, one `symbol_uid` per line)

### 4.2 Fixed subset fixture

Create a dedicated fixture folder, example:

`benchmarks/fixtures/neonabyss2-v1-subset/`

Rules:

1. Sync only paths listed in `sync-manifest.txt`.
2. Keep original relative paths unchanged.
3. Include only `.cs` files.
4. Exclude generated/cache folders and non-source assets.

This fixture becomes the only input path for benchmark regression comparability.

## 5. Data Flow and Pipeline

### Stage A: Sync fixture

Use `rsync` driven by `sync-manifest.txt` to mirror selected directories from NeonAbyss2 into the fixed fixture.

Expected outputs:

1. Synced file tree.
2. File count summary.
3. Sync log artifact for run traceability.

### Stage B: Analyze fixture

Run `analyze` against subset fixture with `.cs` extension filter only.

Expected outputs:

1. Fresh index for fixture repo identity.
2. Analyze runtime baseline sample for performance tracking.

### Stage C: Candidate extraction

Extract candidate symbols from index (Class/Interface/Method) and write to `symbols.candidates.jsonl`.

Candidate row should include:

1. `symbol_uid`
2. `file_path`
3. `symbol_name`
4. `symbol_type`
5. `start_line`
6. `end_line`
7. lightweight ranking hints (for reviewer convenience)

### Stage D: Human selection

Owner picks first 20 symbols into `symbols.selected.txt` with agreed ratio:

1. 14 business-chain symbols
2. 6 infrastructure symbols

### Stage E: Build evaluation dataset

Generate `symbols.jsonl` from selected UIDs and produce initial `relations.jsonl` + `tasks.jsonl`.

Minimal first-pass target density:

1. `relations.jsonl`: 24-36 assertions
2. `tasks.jsonl`: 18-24 tasks, split roughly `query/context/impact = 8/6/6`

### Stage F: Run first full benchmark

Run `benchmark-unity --profile full` on `neonabyss2-v1` dataset and subset fixture target path.

Policy:

1. First report may fail thresholds.
2. Report must still be archived and reviewed as the calibration baseline.

## 6. Error Handling and Guardrails

Pre-run guardrails:

1. Candidate pool size must be >= 30; otherwise fail with guidance to widen `sync-manifest.txt`.
2. Selection size must be exactly stage target (20 for phase one, 50 for phase two).
3. Every selected UID must resolve in current index; unresolved UIDs fail-fast.
4. Dataset schema validation must pass before benchmark execution.

Common failure classes to track in triage:

1. `ambiguous-name-wrong-hit`
2. `context-empty-refs`
3. `impact-downstream-zero`
4. performance regression breaches

Calibration policy:

1. Tune thresholds only in `benchmarks/unity-baseline/neonabyss2-v1/thresholds.json`.
2. Do not modify `unity-mini` baseline thresholds during this phase.

## 7. Testing and Verification Plan

### 7.1 Functional verification

1. `sync-manifest` changes produce deterministic fixture tree.
2. Candidate extraction runs without missing required fields.
3. Dataset schema validation catches malformed rows early.
4. `benchmark-unity` emits both JSON and Markdown reports.

### 7.2 Regression verification

1. Phase 1 run: 20 symbols, first full report archived.
2. Phase 2 run: expand to 50 symbols, rerun full.
3. Phase 3 run: three consecutive full runs with fixed inputs.

Completion criterion for Phase 1.5 closure:

1. All threshold gates pass in three consecutive full runs.
2. No unexplained symbol ambiguity regressions in selected key paths.

## 8. Implementation Plan (Execution Order)

1. Create `neonabyss2-v1` dataset folder and baseline files.
2. Add `sync-manifest.txt` (directory whitelist, one path per line).
3. Add or reuse sync script to build fixed subset fixture via `rsync`.
4. Add candidate extraction script and output contract.
5. Add dataset build step from `symbols.selected.txt`.
6. Produce first 20-symbol dataset and run first full benchmark.
7. Archive report and document threshold-gap analysis.
8. Expand to 50 symbols, calibrate thresholds, execute 3-pass regression.

## 9. Operational Notes

1. Keep all run artifacts under versioned docs path (for comparison and audit).
2. Preserve a stable fixture root path between runs.
3. Record analyze wall-clock time in each run summary for trend visibility.
4. Avoid introducing Phase 3/4 changes before Phase 1.5 closure.

## 10. Acceptance Criteria for This Design

This design is complete when:

1. Dataset structure and file contracts are fixed.
2. Fixture sync strategy and manifest ownership are fixed.
3. 20-symbol and 50-symbol milestones are explicit.
4. First-report failure policy and calibration boundaries are explicit.
5. Three-pass final regression rule is explicit and executable.
