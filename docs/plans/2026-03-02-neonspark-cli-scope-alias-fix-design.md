# NeonSpark CLI Scope + Repo Alias Fix Design

Date: 2026-03-02  
Status: proposed  
Owner: benchmark pipeline

## 1. Problem Statement

Current `neonspark-v1` flow fails at analyze stage for fixture-based execution:

1. `gitnexus analyze <fixture-path>` requires target path to be a Git worktree.
2. Fixture path is not a Git repo, so analyze exits with `Not a git repository`.
3. Existing workaround (`sync fixture + analyze fixture`) adds unnecessary data copy cost and operational complexity.

At the same time, indexing real repo root directly breaks benchmark identity naming:

1. Repo identity defaults to `basename(repoPath)` from `registerRepo`.
2. Real path `/Volumes/Shuttle/unity-projects/neonspark` registers as `neonspark`.
3. Benchmark dataset and scripts currently expect identity `neonspark-v1-subset`.

## 2. Goals

1. Allow analyze to run against a real Git repo root while scanning only a scoped subset.
2. Add explicit repo identity override via CLI (`--repo-alias`) so benchmark uses stable logical name.
3. Keep existing workflows backward compatible (no required changes for current users).
4. Remove need for fixture Git initialization as a prerequisite for P0-T2.

## 3. Non-Goals

1. Changing core graph schema or tool ranking logic.
2. Redesigning benchmark dataset format.
3. Adding multi-repo aggregation behavior.
4. Threshold tuning or benchmark scoring changes.

## 4. Options Considered

### Option A: Keep fixture workflow, auto-`git init` fixture

Pros:
1. Small code changes in sync utility.
2. No analyze API changes.

Cons:
1. Still duplicates large code subsets.
2. Keeps fragile extra state (`fixture/.git`) in benchmark pipeline.
3. Does not solve logical naming cleanly without extra hacks.

### Option B: Analyze real repo root + scope filter + repo alias (recommended)

Pros:
1. Uses existing Git constraints correctly.
2. Avoids fixture copy for indexing.
3. Produces stable benchmark identity through explicit alias.
4. General-purpose feature usable beyond NeonSpark.

Cons:
1. Touches CLI, ingestion pipeline options, and registry write path.
2. Requires clear conflict rules for alias collisions.

### Option C: Special-case analyze to allow non-git directories

Pros:
1. Minimal CLI surface.

Cons:
1. Weakens current repository integrity assumptions.
2. Risks regressions in metadata/commit tracking behavior.
3. Harder to reason about mixed git/non-git indexed entries.

## 5. Recommended Design

Choose **Option B**.

### 5.1 New Analyze CLI Parameters

Add to `gitnexus analyze`:

1. `--repo-alias <name>`
2. `--scope-manifest <path>`
3. `--scope-prefix <pathPrefix>` (repeatable; optional alternative to manifest)

Rules:

1. At least one of `--scope-manifest` or `--scope-prefix` may be provided; both may be combined.
2. Scope filters apply to normalized relative file paths (`/` separators).
3. `--extensions` filtering remains in effect after scope filtering.
4. If scope resolves to zero files, analyze fails fast with actionable error.

### 5.2 Repo Alias Behavior

`--repo-alias` controls the indexed repo identity stored in global registry:

1. If absent: existing behavior (`basename(repoPath)`).
2. If present: canonical registry name becomes alias.
3. Alias must match `^[a-zA-Z0-9._-]{3,64}$`.
4. If alias already exists for another path, analyze fails with conflict message.
5. If alias exists for same path, entry is updated in place.

### 5.3 Scope Rule Semantics

Use manifest syntax already present in `sync-manifest.txt`:

1. Blank lines and `#` comments ignored.
2. Rule ending with `*` means prefix wildcard.
3. Rule without `*` means exact path or any descendant path.

Examples:

1. `Assets/NEON/Code` -> include `Assets/NEON/Code/**`
2. `Packages/com.veewo.*` -> include `Packages/com.veewo.*/**`

### 5.4 Benchmark Command Integration

Add pass-through options to `benchmark-unity`:

1. `--repo-alias <name>`
2. `--scope-manifest <path>`
3. `--scope-prefix <pathPrefix>` (repeatable)

Behavior in benchmark run:

1. Analyze stage forwards alias/scope options.
2. If `--repo` not explicitly provided and `--repo-alias` exists, evaluation tools use alias as repo selector.
3. Existing scripts without these flags remain unchanged.

## 6. Code Touchpoints

### CLI Surface

1. `gitnexus/src/cli/index.ts`
2. `gitnexus/src/cli/analyze.ts`
3. `gitnexus/src/cli/benchmark-unity.ts`

### Benchmark Pipeline

1. `gitnexus/src/benchmark/analyze-runner.ts`
2. `gitnexus/src/benchmark/runner.ts`

### Ingestion Filtering

1. `gitnexus/src/core/ingestion/pipeline.ts`
2. `gitnexus/src/core/ingestion/filesystem-walker.ts` (if early pruning is implemented)

### Registry + Resolution

1. `gitnexus/src/storage/repo-manager.ts`
2. `gitnexus/src/mcp/local/local-backend.ts` (no behavior break expected; confirm alias lookup still works)
3. `gitnexus/src/cli/list.ts` (optional display refinement for alias/original name)

## 7. Data Contract Changes

`RegistryEntry` evolution:

1. Keep `name` as canonical lookup key (may now be alias).
2. Add optional `sourceName` (path basename) for display/debug.
3. Add optional `alias` field (explicitly records user override).

Backward compatibility:

1. Existing registry entries lacking new fields remain valid.
2. Runtime must treat missing `alias/sourceName` as undefined.

## 8. Validation and Error Handling

### Alias Validation

1. Reject invalid format with clear regex hint.
2. Reject collision where same alias maps to different path.

### Scope Validation

1. Reject missing manifest file.
2. Reject manifest with no valid rules.
3. Reject analyze run where filtered set is empty.

### User-Facing Output

On successful analyze, include:

1. `Repo Name: <resolvedName>`
2. `Repo Alias: <alias|none>`
3. `Scope Rules: <count>`
4. `Scoped Files: <n>`

## 9. Testing Plan

### Unit Tests

1. Analyze option parsing (`repo-alias`, `scope-manifest`, repeated `scope-prefix`).
2. Scope matcher semantics (`*` wildcard, exact path, descendant path).
3. Alias conflict detection in registry update path.

### Integration/CLI Tests

1. `analyze` with git root + scope filters indexes only scoped files.
2. `analyze --repo-alias neonspark-v1-subset` registers repo under alias.
3. `list` shows aliased repo name.
4. `benchmark-unity` forwards alias/scope and resolves repo correctly in tool calls.

### Regression Checks

1. Existing `benchmark:quick` and `benchmark:full` scripts still pass.
2. Multi-repo lookup behavior remains unchanged when alias not used.

## 10. Rollout Plan

1. Implement CLI + registry + pipeline changes behind additive flags only.
2. Update `docs/2026-03-02-neonspark-benchmark-usage.md` to replace fixture analyze path with git-root scoped analyze.
3. Switch neonspark scripts to alias+scope flow.
4. Re-run first full benchmark and regenerate reports.

## 11. Proposed Commands After Fix

Analyze with alias and scoped scan:

```bash
cd gitnexus
node dist/cli/index.js analyze --force --extensions .cs /Volumes/Shuttle/unity-projects/neonspark \
  --repo-alias neonspark-v1-subset \
  --scope-manifest ../benchmarks/unity-baseline/neonspark-v1/sync-manifest.txt
```

Benchmark full run:

```bash
cd gitnexus
node dist/cli/index.js benchmark-unity ../benchmarks/unity-baseline/neonspark-v1 \
  --profile full \
  --target-path /Volumes/Shuttle/unity-projects/neonspark \
  --repo-alias neonspark-v1-subset \
  --scope-manifest ../benchmarks/unity-baseline/neonspark-v1/sync-manifest.txt
```

## 12. Acceptance Criteria

1. Analyze succeeds on Git repo root while indexing only scoped subset.
2. Indexed repo can be resolved by `repo=neonspark-v1-subset`.
3. Benchmark run no longer depends on fixture Git initialization.
4. Existing non-scoped analyze workflows remain behavior-compatible.
