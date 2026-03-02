# NeonSpark v1 Benchmark Usage

Run from repo root: `/Users/nantasmac/projects/agentic/GitNexus`.

## 1) Sync fixture

```bash
cd gitnexus
npm run build
node dist/benchmark/neonspark-sync.js /Volumes/Shuttle/unity-projects/neonspark ../benchmarks/fixtures/neonspark-v1-subset ../benchmarks/unity-baseline/neonspark-v1/sync-manifest.txt
```

## 2) Analyze fixture

```bash
cd gitnexus
node dist/cli/index.js analyze --force --extensions .cs ../benchmarks/fixtures/neonspark-v1-subset
```

## 3) Extract candidates

```bash
cd gitnexus
node dist/benchmark/neonspark-candidates.js neonspark-v1-subset ../benchmarks/unity-baseline/neonspark-v1/symbols.candidates.jsonl
```

## 4) Materialize selected symbols

```bash
cd gitnexus
# Curate exactly 20 symbol_uids in ../benchmarks/unity-baseline/neonspark-v1/symbols.selected.txt
node dist/benchmark/neonspark-materialize.js ../benchmarks/unity-baseline/neonspark-v1/symbols.candidates.jsonl ../benchmarks/unity-baseline/neonspark-v1/symbols.selected.txt ../benchmarks/unity-baseline/neonspark-v1/symbols.jsonl
```

## 5) Run full benchmark

```bash
cd gitnexus
npm run benchmark:neonspark:full
```

## 6) Archive report artifacts

```bash
cd gitnexus
cp .gitnexus/benchmark/benchmark-report.json ../docs/reports/2026-03-02-neonspark-v1-benchmark-report.json
cp .gitnexus/benchmark/benchmark-summary.md ../docs/reports/2026-03-02-neonspark-v1-benchmark-summary.md
```
