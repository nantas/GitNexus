# Agent Refactor Context Benchmark Usage

Run from repository root.

## Dataset

- Dataset root: `benchmarks/agent-context/neonspark-refactor-v1`
- Scenario count: 3
- Scenario ids:
  - `minionsmanager-refactor-context`
  - `mainuimanager-refactor-context`
  - `mirrornetmgr-refactor-context`

## Quick Run

```bash
cd gitnexus
npm run benchmark:agent-context:quick
```

## Full Run

```bash
cd gitnexus
npm run benchmark:agent-context:full
```

## Direct CLI (equivalent)

```bash
cd gitnexus
npm run build
node dist/cli/index.js benchmark-agent-context ../benchmarks/agent-context/neonspark-refactor-v1 \
  --profile quick \
  --target-path /path/to/unity-repo \
  --repo-alias neonspark-v1-subset \
  --scope-manifest ../benchmarks/unity-baseline/neonspark-v2/sync-manifest.txt
```

## Reports

Default report output directory:

- `gitnexus/.gitnexus/benchmark-agent-context/benchmark-report.json`
- `gitnexus/.gitnexus/benchmark-agent-context/benchmark-summary.md`

## Nightly Integration Policy

- Agent-context benchmark is integrated as a non-gating nightly step.
- Existing `benchmark-unity` nightly gate remains unchanged.
