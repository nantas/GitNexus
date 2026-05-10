# E2E Profile: neonnew Analyze Performance (3046 files)

> **Date**: 2026-05-11
> **Change**: `perf-scope-resolution-bridge`
> **Repo**: neonnew (scope: `Assets/NEON/Code/Game`, 3046 .cs files)
> **CLI**: GitNexus `1.5.5` with perf-scope-resolution-bridge changes

## Methodology

### Test Setup

1. Copy `Assets/NEON/Code/Game` from neonnew to an isolated temp directory
2. Initialize git repo (`git init + commit`)
3. Run analyze with `--force --extensions .cs` (no `--csharp-define-csproj` to isolate runtime from conditional-compilation preprocessing)
4. Profile via:
   - `NODE_ENV=development` — enables `isDev` gates (per-chunk and per-file progress)
   - `PROF_SCOPE_RESOLUTION=1` — enables scope-resolution sub-stage profiler
   - Ad-hoc `performance.now()` markers for `finalize` sub-stages

### Instrumentation Points

- `runner.ts`: Built-in `✓ Phase: <name> (Xms)` (dev mode)
- `parse-impl.ts`: `⏱ Chunk N/M: processParsing (N files) = Xms` (per-chunk tree-sitter parse)
- `parse-impl.ts`: `⏱ Deferred calls (N records) = Xms` (post-chunk call resolution)
- `parse-impl.ts`: `⏱ Parse total (all chunks) = Xms`
- `run.ts` (scope-resolution): `extract|finalize|propagate|resolve|emit` breakdown via `PROF_SCOPE_RESOLUTION`
- `run.ts` (scope-resolution): `[scope-resolution:finalize] nodeLookup|buildMro|finalizeScope|methodDispatch|workspaceIndex|namespaceSiblings` breakdown

### Env

```bash
NODE_ENV=development PROF_SCOPE_RESOLUTION=1 node dist/cli/index.js analyze <dir> --force --extensions .cs
```

### Hardware

- MacBook Pro (Apple Silicon M-series)
- Node.js v24.13.0
- `--max-old-space-size=8192` (default packaging)

## Raw Results

### Phase Timing (3046 files, 1 chunk, worker pool)

| Phase | Duration | % of Total |
|-------|----------|------------|
| scan | 27ms | 0.0% |
| structure | 9ms | 0.0% |
| markdown | 0ms | 0.0% |
| cobol | 1ms | 0.0% |
| **parse** | **8,718ms** | **11.2%** |
| ├ processParsing | 8,467ms | 10.9% |
| ├ import/heritage/routes | ~250ms | 0.3% |
| routes | 2ms | 0.0% |
| tools | 0ms | 0.0% |
| orm | 0ms | 0.0% |
| unity-scan | 919ms | 1.2% |
| crossFile | 1ms | 0.0% |
| **scopeResolution** | **54,080ms** | **69.7%** |
| ├ extract | 81ms | 0.1% |
| ├ **finalize** | **39,023ms** | **50.2%** |
| ├ propagate | 368ms | 0.5% |
| ├ **resolve** | **14,423ms** | **18.6%** |
| ├ emit | 571ms | 0.7% |
| mro | 3ms | 0.0% |
| communities | 380ms | 0.5% |
| processes | 126ms | 0.2% |
| unity-enrich | 2ms | 0.0% |
| **Total** | **~77.6s** | **100%** |

### Finalize Sub-stage Breakdown

| Sub-stage | Duration | % of finalize | % of total |
|-----------|----------|---------------|------------|
| `nodeLookup` | 26ms | 0.1% | 0.0% |
| `buildMro` | 8ms | 0.0% | 0.0% |
| `finalizeScopeModel` | 9,653ms | 24.7% | 12.4% |
| `methodDispatch` | 0ms | 0.0% | 0.0% |
| `workspaceIndex` | 3ms | 0.0% | 0.0% |
| **`namespaceSiblings`** | **29,333ms** | **75.2%** | **37.7%** |
| **finalize total** | **39,023ms** | **100%** | **50.2%** |

### Scope-resolution profile

```
extract=81ms finalize=38579ms propagate=368ms resolve=14423ms emit=571ms total=54022ms (3046 files)
```

### Edge Output

```
40,858 nodes | 86,791 edges | 1597 clusters | 300 flows
5,117 IMPORTS + 16,372 reference edges (43,950 unresolved sites, 13,067 skipped)
```

## Root Cause Analysis

### Pathological Code Path

The `populateCsharpNamespaceSiblings` function in `namespace-siblings.ts` re-parses every single file with tree-sitter to extract namespace names, despite `ParsedFile` having already extracted this information during the scope extraction phase.

**Flow**:
```
worker pool → scopeTreeCache = ∅ (worker_threads can't return native tree-sitter Trees)
scope-resolution extract (pre-extracted path) → skips re-parse (81ms total)
populateNamespaceSiblings → getFileContents() → getCsharpParser().parse() × 3046 files
  → extractFileStructureWithFallback(content, cachedTree=undefined)
  → tree-sitter parse per file = ~29s
```

**Why**: `ParsedFile` tracks `scopes` with `kind: 'Namespace'` but the SCOPE DATA STRUCTURE does NOT carry the namespace **name string**. `hasNamespaceScope(parsed)` returns boolean, not the name. The name is only available from the tree-sitter AST (`namespace_declaration name:` field). The scope extraction phase already visited these nodes but discarded the name.

**Sequential path contrast**: In the sequential parse path, `scopeTreeCache` is populated — `extractFileStructureWithFallback` reuses the cached tree (no re-parse). But worker path has no trees to cache.

### Secondary Bottlenecks

| Bottleneck | Duration | Mitigation | Priority |
|------------|----------|------------|----------|
| `finalizeScopeModel` | 9,653ms | Already optimized; O(n) binding resolution, proportional to scopes | Low |
| `resolve` (resolveReferenceSites) | 14,423ms | O(sites × lookup depth); proportional to 43,950 unresolved sites | Medium |
| `processParsing` | 8,467ms | Tree-sitter parse + scope extraction; worker-parallelizable | Low |

## Conclusions

### Primary Finding
**`populateCsharpNamespaceSiblings` causes a 29s re-parse of all 3046 files**, accounting for 37.7% of total E2E time and 75% of the `finalize` stage. This is the single biggest bottleneck and directly fixable.

### Fix Strategy
Add `namespaceNames: readonly string[]` to `ParsedFile` (in `gitnexus-shared`), populate it during `emitCsharpScopeCaptures` (scope extraction in worker), and use it in `deriveCsharpFileStructure` to skip the tree-sitter AST walk.

### Validation
Test fixture: `Assets/NEON/Code/Game` (3046 files). Reproducible benchmark command:
```bash
cp -r <neonnew>/Assets/NEON/Code/Game <tmp> && cd <tmp> && git init && git add -A && git commit -m "init"
NODE_ENV=development PROF_SCOPE_RESOLUTION=1 gitnexus analyze <tmp> --force --extensions .cs 2>&1 | grep -E 'finalize:|scope-resolution prof'
```

Expected improvement: namespaceSiblings from ~29s → ~100ms (<1s), finalize from ~39s → ~10s, total from ~77s → ~48s (38% reduction).

### Benchmark Repeatability Notes

- Warm-up run before timed run prevents cold-start penalty
- `--extensions .cs` restricts to C# only (Unity project)
- No `--csharp-define-csproj` flag (avoids conditional-compilation preprocessing overhead)
- Always `rm -rf .gitnexus` between runs for clean state
- 3-run minimum for statistical significance (only 2 runs captured in this session due to time constraints)
