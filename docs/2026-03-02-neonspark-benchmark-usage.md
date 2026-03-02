# NeonSpark v1 Benchmark Usage

Run from repo root: `/Users/nantasmac/projects/agentic/GitNexus`.

## 1) Analyze repo root with scoped scan (no fixture git init needed)

```bash
cd gitnexus
npm run build
node dist/cli/index.js analyze --force --extensions .cs /Volumes/Shuttle/unity-projects/neonspark \
  --repo-alias neonspark-v1-subset \
  --scope-manifest ../benchmarks/unity-baseline/neonspark-v1/sync-manifest.txt
```

## 2) Extract candidates

```bash
cd gitnexus
node dist/benchmark/neonspark-candidates.js neonspark-v1-subset ../benchmarks/unity-baseline/neonspark-v1/symbols.candidates.jsonl
```

## 3) Materialize selected symbols

```bash
cd gitnexus
# Curate exactly 20 symbol_uids in ../benchmarks/unity-baseline/neonspark-v1/symbols.selected.txt
node dist/benchmark/neonspark-materialize.js ../benchmarks/unity-baseline/neonspark-v1/symbols.candidates.jsonl ../benchmarks/unity-baseline/neonspark-v1/symbols.selected.txt ../benchmarks/unity-baseline/neonspark-v1/symbols.jsonl
```

## 4) Run full benchmark

```bash
cd gitnexus
npm run benchmark:neonspark:full
```

## 5) Archive report artifacts

```bash
cd gitnexus
cp .gitnexus/benchmark/benchmark-report.json ../docs/reports/2026-03-02-neonspark-v1-benchmark-report.json
cp .gitnexus/benchmark/benchmark-summary.md ../docs/reports/2026-03-02-neonspark-v1-benchmark-summary.md
```
