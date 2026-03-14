# U3 Unity Serializable Resource Binding Release Runbook (2026-03-10)

## 1. Scope

This runbook applies to the U3 capability release for Unity serializable class resource binding:

- `UNITY_SERIALIZED_TYPE_IN` graph relation
- `context/query --unity-resources on` resource binding enrichment for serializable classes (for example `AssetRef`)
- U3 gates in code-level tests and real-repo scheduled E2E

## 2. Capability Boundaries

In scope:

- Serializable class symbol can return non-empty `resourceBindings` under `unity-resources=on`
- `CharacterList` style nested `AssetRef` entries expose structured `assetRefPaths`
- Graph-level observability via `UNITY_SERIALIZED_TYPE_IN` edge counts

Out of scope:

- Cross-repo coverage as a hard prerequisite (current strategy is Unity serialization rule-level consistency + multi-sample validation in the same repo)
- Perfect recovery for non-structured `_relativePath` strings that do not follow stable serialization shape

## 3. Release Gates

### 3.1 Code-level block gates

Command:

```bash
npm --prefix gitnexus run check:release-paths
npm --prefix gitnexus run test:u3:gates
```

Expected:

- pass (no failed test)
- U3 assertions covered in benchmark/ingestion/mcp test suite

### 3.2 Real-repo scheduled block gate (local scheduler / self-hosted runner)

Required environment variable:

- `GITNEXUS_U2_E2E_TARGET_PATH`: absolute path to Unity real repo

Optional environment variables:

- `GITNEXUS_U2_E2E_ESTIMATE_LOWER_SEC`
- `GITNEXUS_U2_E2E_ESTIMATE_UPPER_SEC`

Gate command executed by scheduler:

```bash
npm --prefix gitnexus run benchmark:u2:e2e
```

Required U3 outcomes in report:

- `AssetRef context(on) resourceBindings > 0`
- `UNITY_SERIALIZED_TYPE_IN edge count > 0`
- `CharacterList AssetRef sprite instances > 0`

## 4. Known Limitations

1. `context(name=...)` may return `ambiguous` for duplicated class names; benchmark gate already includes disambiguation fallback, but ad-hoc manual queries should prefer `uid`/`file_path`.
2. Real-repo E2E depends on self-hosted runner environment stability; first-run analyze can occasionally fail and may require rerun.
3. `_relativePath` extraction still depends on serialized text pattern quality; malformed or custom-shaped payloads may degrade precision.

## 5. Rollback Strategy

1. Soft rollback (service continuity): switch retrieval calls to `--unity-resources off`.
2. Data rollback (index reset): run `npx gitnexus clean --force` and rebuild index.
3. Code rollback (release rollback): revert U3 change set and publish patch release.

Recommended order: soft rollback -> data rollback -> code rollback.

## 6. Troubleshooting Commands

Build and test:

```bash
npm --prefix gitnexus run build
npm --prefix gitnexus run test:u3:gates
```

Run real-repo E2E locally:

```bash
GITNEXUS_U2_E2E_TARGET_PATH=/path/to/unity-repo \
npm --prefix gitnexus run benchmark:u2:e2e
```

Quick inspect latest report:

```bash
ls -1dt docs/reports/neonspark-u2-*/ | head -n 1
```

Read key verdict values:

```bash
cat docs/reports/<run-id>/retrieval-summary.json
cat docs/reports/<run-id>/final-verdict.md
```

## 7. Release Checklist

1. `test:u3:gates` pass
2. latest scheduled local real-repo gate run pass
3. latest E2E report confirms three U3 hard gates
4. project doc/DoD state updated

## 8. Lazy Expand Hardening Knobs (2026-03-14)

Environment variables (context lazy hydration path):

- `GITNEXUS_UNITY_LAZY_MAX_PATHS`: max pending resource paths resolved in a single request. Default `120`.
- `GITNEXUS_UNITY_LAZY_BATCH_SIZE`: per-batch hydration chunk size. Default `30`.
- `GITNEXUS_UNITY_LAZY_MAX_MS`: max elapsed hydration budget before early stop. Default `5000`.

Diagnostics interpretation:

- `lazy-expand budget exceeded after <N>ms`: hydration stopped early by budget cap; output is partial but valid.
- `lazy-expand failed: ...`: hydration failure (I/O, parse, or resolver error). Baseline lightweight payload is still returned.
- Empty `unityDiagnostics` with non-empty `resourceBindings`: lazy hydration completed within budget and no resolver warnings surfaced.
