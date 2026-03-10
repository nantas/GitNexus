# NeonSpark / NeonAbyss2 Benchmark Usage (Unified)

Run from repository root.

## 0) Repo Path Clarification

- `NeonAbyss2` and `NeonSpark` refer to the same physical Unity repository path in this workflow:
  - `/path/to/unity-repo`
- Benchmark datasets are separate calibration contracts over that same source repo:
  - v1 baseline dataset: `benchmarks/unity-baseline/neonspark-v1`
  - v2 expanded calibration dataset: `benchmarks/unity-baseline/neonspark-v2`

## 1) v1 Baseline Calibration Flow

### Analyze with v1 scope manifest

```bash
cd gitnexus
npm run build
node dist/cli/index.js analyze --force --extensions .cs /path/to/unity-repo \
  --repo-alias neonspark-v1-subset \
  --scope-manifest ../benchmarks/unity-baseline/neonspark-v1/sync-manifest.txt
```

### Extract candidates (v1)

```bash
cd gitnexus
node dist/benchmark/neonspark-candidates.js neonspark-v1-subset ../benchmarks/unity-baseline/neonspark-v1/symbols.candidates.jsonl
```

### Materialize selected symbols (v1)

```bash
cd gitnexus
# Curate symbol_uids in ../benchmarks/unity-baseline/neonspark-v1/symbols.selected.txt
node dist/benchmark/neonspark-materialize.js \
  ../benchmarks/unity-baseline/neonspark-v1/symbols.candidates.jsonl \
  ../benchmarks/unity-baseline/neonspark-v1/symbols.selected.txt \
  ../benchmarks/unity-baseline/neonspark-v1/symbols.jsonl
```

### Run v1 benchmarks

```bash
cd gitnexus
npm run benchmark:neonspark:quick
npm run benchmark:neonspark:full
```

### Archive v1 artifacts (runN pattern)

```bash
cd gitnexus
RUN_TAG="2026-03-02-neonspark-v1-runN"   # replace runN with quick/full/run1/run2...
cp .gitnexus/benchmark/benchmark-report.json ../docs/reports/${RUN_TAG}-report.json
cp .gitnexus/benchmark/benchmark-summary.md ../docs/reports/${RUN_TAG}-summary.md
```

Committed examples that currently exist:

- `docs/reports/2026-03-02-neonspark-v1-benchmark-report.json`
- `docs/reports/2026-03-02-neonspark-v1-benchmark-summary.md`
- `docs/reports/2026-03-02-neonspark-v1-p0-t4-run2-report.json`
- `docs/reports/2026-03-02-neonspark-v1-p0-t4-run2-summary.md`
- `docs/reports/2026-03-02-neonspark-v1-p0-t4-run3-report.json`
- `docs/reports/2026-03-02-neonspark-v1-p0-t4-run3-summary.md`

## 2) v2 Expanded Calibration Flow

Use this when validating the larger symbol/relation/task set and robust thresholds.

### Analyze with v2 scope manifest

```bash
cd gitnexus
npm run build
node dist/cli/index.js analyze --force --extensions .cs /path/to/unity-repo \
  --repo-alias neonspark-v1-subset \
  --scope-manifest ../benchmarks/unity-baseline/neonspark-v2/sync-manifest.txt
```

### Extract candidates (v2)

```bash
cd gitnexus
node dist/benchmark/neonspark-candidates.js neonspark-v1-subset ../benchmarks/unity-baseline/neonspark-v2/symbols.candidates.jsonl
```

### Materialize selected symbols (v2)

```bash
cd gitnexus
# Curate symbol_uids in ../benchmarks/unity-baseline/neonspark-v2/symbols.selected.txt
node dist/benchmark/neonspark-materialize.js \
  ../benchmarks/unity-baseline/neonspark-v2/symbols.candidates.jsonl \
  ../benchmarks/unity-baseline/neonspark-v2/symbols.selected.txt \
  ../benchmarks/unity-baseline/neonspark-v2/symbols.jsonl
```

### Run v2 benchmarks

```bash
cd gitnexus
npm run benchmark:neonspark:v2:quick
npm run benchmark:neonspark:v2:full
```

### Archive v2 quick artifacts (run1/run2 or runN)

```bash
cd gitnexus
cp .gitnexus/benchmark/benchmark-report.json ../docs/reports/2026-03-02-neonspark-v2-quick-run1-report.json
cp .gitnexus/benchmark/benchmark-summary.md ../docs/reports/2026-03-02-neonspark-v2-quick-run1-summary.md

# Second quick pass (or subsequent pass) example:
cp .gitnexus/benchmark/benchmark-report.json ../docs/reports/2026-03-02-neonspark-v2-quick-run2-report.json
cp .gitnexus/benchmark/benchmark-summary.md ../docs/reports/2026-03-02-neonspark-v2-quick-run2-summary.md
```

### Archive v2 full artifacts (runN pattern)

```bash
cd gitnexus
RUN_TAG="2026-03-02-neonspark-v2-runN"   # replace runN with run1/run2/run3...
cp .gitnexus/benchmark/benchmark-report.json ../docs/reports/${RUN_TAG}-report.json
cp .gitnexus/benchmark/benchmark-summary.md ../docs/reports/${RUN_TAG}-summary.md
```

Committed full-run examples that currently exist:

- `docs/reports/2026-03-02-neonspark-v2-run1-report.json`
- `docs/reports/2026-03-02-neonspark-v2-run1-summary.md`
- `docs/reports/2026-03-02-neonspark-v2-run2-report.json`
- `docs/reports/2026-03-02-neonspark-v2-run2-summary.md`
- `docs/reports/2026-03-02-neonspark-v2-run3-report.json`
- `docs/reports/2026-03-02-neonspark-v2-run3-summary.md`
