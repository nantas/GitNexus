# Writeback: restore-local-backend-unity-features

## Writeback Targets (from binding.md)

### 1. docs/unity-runtime-process-source-of-truth.md

**Update Scope**: Add local-backend.ts Unity adapter interface documentation.

**Changes Required**:
- Document `attachUnityContext()` adapter function signature and behavior
- Document `enrichWithUnityEvidence()` adapter function signature and behavior
- Update `Flow: LocalBackend Unity Context Query` diagram to show adapter injection points

**Status**: ✅ Done (2026-05-09) — Added §2.2 point 5 documenting both adapter functions and their integration points

### 2. docs/2026-03-18-upstream-merge-feasibility-and-checklist.md

**Update Scope**: Mark local backend Unity feature restoration as complete.

**Changes Required**:
- Update § strategy deviation section — local-backend.ts Unity features restored via adapter pattern (D1)
- Mark checklist items for Unity hydration/evidence/context as done
- Add note: adapter pattern (not re-merge) chosen to avoid repeating 6482-line conflict

**Status**: ✅ Done (2026-05-09) — Added end-of-document update section documenting adapter restoration, changed merge strategy impact, and remaining limitations

### 3. AGENTS.md (if CLI/setup/skill behavior changed)

**Assessment**: No changes to CLI commands, `gitnexus setup` behavior, or skill file format. Unity pipeline phases are runtime-conditional (no new CLI flags). No AGENTS.md update needed.

**Status**: ✅ No update required

## Field Mapping (spec → implementation)

| Design Decision | Implementation |
|----------------|---------------|
| D1: Adapter Pattern | `attachUnityContext()` / `enrichWithUnityEvidence()` as thin adapters calling unity-*.ts modules |
| D2: Two-phase injection | Context handler (attachUnityContext) + Query handler (enrichWithUnityEvidence) |
| D3: Pipeline as DAG Phase | `unity-scan` + `unity-enrich` phases registered in `buildPhaseList()` |
| D4: Response Profile | Slim/full logic in `attachUnityContext()` return path |
| D5: Hydration first, Cypher second | Hydration fully wired; `buildWorkflowResponse()` calls `verifyRuntimeChainOnDemand()` for real chain evidence |
| D6: Reuse executeParameterized | All graph queries go through `executeParameterized()` — no new DB paths |

## Prerequisites for Writeback Execution

- [x] Manual review of `docs/unity-runtime-process-source-of-truth.md` to determine exact insertion points
- [ ] E2E validation on neonspark for confirmation of behavior (optional but recommended)
- [x] Update merge checklist document with restored feature status

## Writeback Owner

- Owner: @nantas-dev (per binding.md)
- Timing: After E2E verification is complete
