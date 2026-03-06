# Unity Resource Cross-Reference Acceptance

Date: 2026-03-06

## Scope

- Phase 0 CLI validation via `unity-bindings`
- Phase 1 graph-native `context/query` enrichment via `unity_resources`
- Real-repo sampling against `/Volumes/Shuttle/unity-projects/neonspark`

## Targeted Verification

Executed:

```bash
cd gitnexus
npm run build
node --test dist/core/unity/*.test.js
node --test dist/core/ingestion/unity-resource-processor.test.js
node --test dist/cli/unity-bindings.test.js
node --test dist/mcp/local/unity-enrichment.test.js
```

Result:

- PASS

## Real-Repo Acceptance

### Notes

- A full forced rebuild of `/Volumes/Shuttle/unity-projects/neonspark` with the local CLI exceeded a 1 hour timeout on 2026-03-06.
- For graph-native `context/query` validation, a scoped acceptance index was created instead:
  - repo alias: `neonspark-unity-acceptance`
  - scope: `Assets/NEON/Code/VeewoUI/MainUIManager.cs`
- Phase 0 `unity-bindings` validation still ran directly against the full real repo path.

### Commands

```bash
node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/unity-projects/neonspark --force
node gitnexus/dist/cli/index.js analyze /Volumes/Shuttle/unity-projects/neonspark --force --repo-alias neonspark-unity-acceptance --scope-prefix Assets/NEON/Code/VeewoUI/MainUIManager.cs

node gitnexus/dist/cli/index.js unity-bindings Global --target-path /Volumes/Shuttle/unity-projects/neonspark
node gitnexus/dist/cli/index.js unity-bindings BattleMode --target-path /Volumes/Shuttle/unity-projects/neonspark
node gitnexus/dist/cli/index.js unity-bindings PlayerActor --target-path /Volumes/Shuttle/unity-projects/neonspark
node gitnexus/dist/cli/index.js unity-bindings MainUIManager --target-path /Volumes/Shuttle/unity-projects/neonspark

node gitnexus/dist/cli/index.js context MainUIManager --repo neonspark-unity-acceptance --unity-resources on
node gitnexus/dist/cli/index.js query MainUIManager --repo neonspark-unity-acceptance --unity-resources on
```

### Sample Summary

| Symbol | Resource Bindings | Scalar Fields | Reference Fields |
| --- | ---: | ---: | ---: |
| `Global` | 1 | 9 | 2 |
| `BattleMode` | 2 | 6 | 6 |
| `PlayerActor` | 7 | 94 | 41 |
| `MainUIManager` | 4 | 7 | 5 |

Aggregate acceptance:

- `hasScalar = true`
- `hasReference = true`

### Graph-Native Query/Context Check

Scoped acceptance index observations:

- `context MainUIManager --unity-resources on`
  - returned `resourceBindings`
  - returned aggregated `serializedFields`
  - returned empty `unityDiagnostics`
- `query MainUIManager --unity-resources on`
  - enriched returned symbol entries under `definitions[]`
  - included `resourceBindings`, `serializedFields`, and `unityDiagnostics`

### Outcome

- Phase 0 acceptance: PASS
- Phase 1 scoped graph-native acceptance: PASS
- DoD coverage rule (`scalar + reference` across 4 real samples): PASS

## Performance Optimization Regression (2026-03-06)

### Full Suite Verification

Executed:

```bash
cd gitnexus
npm run build
node --test \
  dist/core/unity/*.test.js \
  dist/core/ingestion/unity-resource-processor.test.js \
  dist/cli/unity-bindings.test.js \
  dist/mcp/local/unity-enrichment.test.js \
  dist/cli/analyze-multi-scope-regression.test.js
```

Result:

- PASS (`20/20`)

### Scoped Analyze Sampling

Original scoped real-repo command from the design discussion:

```bash
gitnexus analyze --repo-alias neonspark-unity-acceptance --scope-prefix Assets/NEON/Code/VeewoUI/MainUIManager.cs --extensions .cs --force
```

In this repository workspace, that exact scope prefix does not exist, so an equivalent local scoped sample was used:

```bash
npx gitnexus analyze --repo-alias neonspark-unity-acceptance-local --scope-prefix gitnexus/src/core/unity/__fixtures__/mini-unity/Assets --extensions .cs --force
```

Observed summary:

- `Scoped Files: 4`
- `File filter: .cs`
- analyze pipeline completed successfully

Programmatic pipeline sample (same scope/filter) confirms the new enrich diagnostics payload:

```json
[
  "scanContext: scripts=4, guids=4, resources=0"
]
```

### Known Limitation

- Current CLI analyze summary does not print `unityResult.diagnostics`; diagnostics are available from pipeline result / APIs.
