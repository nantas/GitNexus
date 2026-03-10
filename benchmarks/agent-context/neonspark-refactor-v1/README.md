# Neonspark Refactor Context Benchmark v1

Scenario dataset for agent refactor-context evaluation.

## Files

- `thresholds.json`: suite gate thresholds.
- `scenarios.jsonl`: 3 scenario rows (MinionsManager, MainUIManager, MirrorNetMgr).

## Run

```bash
cd gitnexus
npm run build
node dist/cli/index.js benchmark-agent-context ../benchmarks/agent-context/neonspark-refactor-v1 --profile quick --target-path /path/to/unity-repo --repo-alias neonspark-v1-subset --scope-manifest ../benchmarks/unity-baseline/neonspark-v2/sync-manifest.txt
```
