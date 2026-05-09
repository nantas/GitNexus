# Upstream Merge Feasibility And Checklist

Date: 2026-03-18
Target: merge `upstream/main` into `nantas-dev`

## Scope

This document fixes the current feasibility analysis into the repository and turns it into an execution checklist for the real merge.

Analysis inputs:

- Current local branch: `nantas-dev`
- Fork remote branch: `origin/nantas-dev` at `7c5aa953c0563242148138e96bcf0c8fad8d247b`
- Upstream branch: `upstream/main` at `7376e92063cd1a721e1754aa179f8af0502abe91`
- Merge base: `019ed3ff85e27963ce4bb49227e1f1e3015b5acc`
- GitNexus index state during investigation: stale

## Executive Summary

The merge is feasible, but not safe to do as a blind merge or file-level side pick.

Key findings:

- `upstream/main` is 65 commits ahead of the merge base.
- `origin/nantas-dev` is 145 commits ahead of the merge base.
- `upstream` has 134 unique changed files since the merge base.
- `nantas-dev` has 400 unique changed files since the merge base.
- Both sides changed 34 overlapping files.
- Dry-run merge conflict preview reports 20 conflicted files.
- 12 of those 20 conflicts are core package or source files, not just docs/workflows.

Bottom line:

- Upstream does not directly replace the fork's Unity-focused feature set.
- The main risk is semantic conflict in shared infrastructure files: analyze, pipeline, parser worker, MCP backend, repo registry, package metadata.
- The merge should be done in a dedicated integration branch and resolved manually.

## Current Branch Context

The fork branch has continued well beyond the current upstream branch after the common base.

Fork-side themes:

- Unity resource binding and hydration pipeline
- Lazy/parity hydration, overlay/cache, and diagnostics
- Scoped analyze, repo alias, and custom release/setup behavior
- Benchmark tooling and report corpus
- Analyze memory reduction work

Upstream-side themes:

- Kotlin/Swift/C/C++/C#/Rust language support consolidation
- MCP startup compatibility and hook hardening
- CI and publish workflow hardening
- Test suite expansion
- Security and query-safety improvements

Although both sides report `gitnexus/package.json` version `1.3.11`, the implementation diverged materially.

## Conflict Preview

The merge dry-run produced conflicts in these files:

- `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`
- `.github/workflows/ci.yml`
- `.github/workflows/publish.yml`
- `.gitignore`
- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `gitnexus/README.md`
- `gitnexus/package-lock.json`
- `gitnexus/package.json`
- `gitnexus/src/cli/ai-context.ts`
- `gitnexus/src/cli/analyze.ts`
- `gitnexus/src/cli/index.ts`
- `gitnexus/src/core/ingestion/parsing-processor.ts`
- `gitnexus/src/core/ingestion/pipeline.ts`
- `gitnexus/src/core/ingestion/workers/parse-worker.ts`
- `gitnexus/src/core/kuzu/csv-generator.ts`
- `gitnexus/src/core/kuzu/schema.ts`
- `gitnexus/src/mcp/local/local-backend.ts`
- `gitnexus/src/storage/repo-manager.ts`

Conflict classification:

- Meta/docs/workflow conflicts: 8
- Core package/source conflicts: 12

## High-Risk Merge Areas

### 1. Analyze entrypoint

File: `gitnexus/src/cli/analyze.ts`

Fork adds:

- scoped analyze options
- repo alias persistence
- runtime summary and fallback reporting
- analyze close/signal handling policy

Upstream adds:

- verbose mode
- embedding count persistence
- updated finalize behavior

Merge rule:

- keep fork analyze option flow and summary/reporting
- absorb upstream embedding count and compatible finalize changes
- do not drop scope, alias, or reuse-options behavior

### 2. Ingestion pipeline

File: `gitnexus/src/core/ingestion/pipeline.ts`

Fork adds:

- scope filtering
- extension filtering
- Unity resource path scanning
- Unity enrichment stage and result payload

Upstream adds:

- parser availability guards
- route extraction flow
- improved worker bootstrap fallback

Merge rule:

- keep fork scope and Unity stages
- absorb upstream parser availability and route extraction logic
- verify pipeline return type still carries fork-specific diagnostics and Unity result data

### 3. Parse worker

File: `gitnexus/src/core/ingestion/workers/parse-worker.ts`

Fork changes:

- line number semantics for stored positions

Upstream changes:

- larger multi-language parser set
- optional Swift handling
- shared export/framework detection helpers
- route extraction output

Merge rule:

- start from upstream worker shape
- reapply fork line-number semantics only if still required by downstream tests and MCP responses
- verify extracted payload contract still matches fork pipeline consumers

### 4. MCP local backend

File: `gitnexus/src/mcp/local/local-backend.ts`

Fork adds:

- Unity resource modes and hydration modes
- lazy/parity hydration
- overlay cache and parity cache
- warmup queue and diagnostics wiring

Upstream adds:

- parameterized Cypher execution
- write-query detection
- safer error logging and exported validation helpers

Merge rule:

- keep fork Unity context pipeline
- absorb upstream query hardening instead of preserving raw string query interpolation
- regression-test `query`, `context`, and Unity enrichment modes after merge

### 5. Repository registry/config handling

File: `gitnexus/src/storage/repo-manager.ts`

Fork adds:

- repo alias support
- `GITNEXUS_HOME`
- richer registry metadata

Upstream adds:

- case-insensitive Windows path matching
- config file permission hardening

Merge rule:

- keep alias and custom home support
- absorb upstream platform/path and config permission hardening

### 6. Package metadata

Files:

- `gitnexus/package.json`
- `gitnexus/package-lock.json`

Fork adds:

- scoped package name `@veewo/gitnexus`
- benchmark and release-path scripts

Upstream adds:

- vitest-based test scripts
- Kotlin and optional Swift dependencies
- postinstall patch script

Merge rule:

- do not pick either side wholesale
- compose a merged script/dependency set explicitly
- regenerate lockfile from the merged manifest

## Effect On Fork Features

The fork's Unity-specific functionality is not directly overwritten by upstream business logic. Upstream changes barely touch Unity-specific files. The real risk is indirect:

- shared pipeline files were changed on both sides
- shared CLI/MCP entrypoints were changed on both sides
- package manifest and lockfile changed on both sides

Expected impact if merge is done carefully:

- Unity features should remain viable
- fork-specific benchmark/report tooling should remain viable
- some downstream behavior may shift if parser worker, analyze output, or MCP backend semantics drift

Expected impact if merge is done carelessly:

- scoped analyze may disappear
- repo alias handling may disappear
- Unity hydration or lazy/parity expansion may regress
- query safety improvements from upstream may be lost
- package/test/runtime setup may become inconsistent

## Actual Merge Execution Checklist

### Phase 0: Preflight

- Create a dedicated integration branch from `nantas-dev`.
- Fetch both remotes immediately before the merge.
- Record the exact branch heads and merge base in the merge PR/notes.
- Rebuild the GitNexus index before using graph-based follow-up analysis.

Suggested commands:

```bash
git fetch origin --prune
git fetch upstream --prune
git switch nantas-dev
git switch -c chore/merge-upstream-2026-03-18
git merge-base upstream/main origin/nantas-dev
```

### Phase 1: Perform the merge

- Run a normal merge from `upstream/main` into the integration branch.
- Do not use `-X ours` or `-X theirs`.
- Stop and review each conflicted file manually.

Suggested command:

```bash
git merge upstream/main
```

### Phase 2: Resolve conflicts in priority order

Priority order:

1. `gitnexus/src/cli/analyze.ts`
2. `gitnexus/src/core/ingestion/pipeline.ts`
3. `gitnexus/src/core/ingestion/workers/parse-worker.ts`
4. `gitnexus/src/mcp/local/local-backend.ts`
5. `gitnexus/src/storage/repo-manager.ts`
6. `gitnexus/package.json`
7. `gitnexus/package-lock.json`
8. Remaining source conflicts
9. Workflow/docs conflicts

Resolution rules:

- Prefer semantic merge over side selection.
- Preserve fork Unity/scoped-analyze behavior.
- Absorb upstream parser support, query hardening, and test/runtime improvements.
- Recreate the lockfile only after `package.json` is final.

### Phase 3: Post-merge verification

Minimum verification set:

- install dependencies cleanly
- build succeeds
- core tests succeed
- fork-specific benchmark or Unity gate succeeds
- MCP/query paths still work

Suggested commands:

```bash
cd gitnexus
npm install
npm run build
npm run test:all
npm run test:benchmark
npm run test:u3:gates
```

If the full suite is too expensive for the first pass, run at least:

```bash
cd gitnexus
npm install
npm run build
npm run test:all
```

Then run the fork-specific suites before merge approval.

### Phase 4: Regression focus

Verify these behaviors explicitly:

- `analyze` with scope/alias/reuse-options still works
- Unity context returns resource bindings and diagnostics
- lazy/parity hydration still expands correctly
- parameterized query path still works
- parser availability fallback behaves correctly when optional parsers are missing
- package install still works with Kotlin/Swift dependency model

### Phase 5: Finish

- Stage only intended resolutions.
- Commit with a merge commit, not a rebase rewrite.
- Capture any follow-up regressions as separate commits after the merge commit.

Suggested commit message:

```bash
git commit
```

Recommended title:

```text
Merge upstream/main into nantas-dev
```

## Recommended Acceptance Criteria

The merge should not be considered complete unless all of the following are true:

- integration branch merges `upstream/main` cleanly after manual conflict resolution
- fork Unity features remain present
- upstream language/runtime/security improvements remain present
- `gitnexus` package metadata is internally consistent
- build passes
- targeted tests pass
- index rebuild succeeds after merge

## Notes

This document reflects the state of investigation on 2026-03-18 before index rebuild. Any follow-up graph-based impact analysis should be done only after a fresh `npx -y @veewo/gitnexus@latest analyze`.

---

## Update (2026-05-09): Local-Backend Unity Features Restored

### Resolution

Instead of performing the risky full upstream re-merge (which would reintroduce the 6482-line conflict in `local-backend.ts`), the Unity hydration/evidence/context features were restored via the **adapter pattern**:

- `attachUnityContext()` — adapter for `context()` handler Unity hydration injection
- `enrichWithUnityEvidence()` — adapter for `query()` handler Unity evidence + workflow injection
- `buildWorkflowResponse()` — executes real `verifyRuntimeChainOnDemand()` for matched runtime processes

### What Changed

| Concern | Resolution |
|---|---|
| Unity context query with hydration | Restored via `attachUnityContext()` calling `unity-runtime-hydration.ts` |
| Lazy/parity hydration + overlay cache | Delegated to existing hydration modules; no re-merge needed |
| Agent-safe response envelope | Restored via `enrichWithUnityEvidence()` with `confidence` + `evidence` fields |
| Cypher workflow execution | Restored: `buildWorkflowResponse()` calls `verifyRuntimeChainOnDemand()` instead of placeholder |
| `runtime_chain_verify=on-demand` | Added to `query()` params; integrates with existing `runtime-chain-verify.ts` |
| Parameterized query hardening | Preserved (upstream security fix unchanged) |
| Pipeline Unity phases | `unity-scan.ts` + `unity-enrich.ts` already registered in `pipeline.ts` |

### Remaining Limitations

- E2E verification on neonspark Unity project is pending project access
- Full Cypher workflow templates for specific processes (Reload, GunGraph, etc.) rely on `verifyRuntimeChainOnDemand` graph-only closure; no hardcoded per-process templates needed in V2

### Impact on Merge Strategy

- **No longer required**: Re-merge `upstream/main` solely to recover Unity features
- **Still recommended**: Eventually merge upstream for language support (Kotlin/Swift/C#/Rust) and security improvements, but Unity features are now independent of that merge
- The adapter approach decouples Unity feature maintenance from upstream merge cadence
