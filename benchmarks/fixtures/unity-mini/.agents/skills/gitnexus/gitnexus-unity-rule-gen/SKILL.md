---
name: gitnexus-unity-rule-gen
description: "Reduced rule-lab workflow for Unity analyze_rules authoring from exact source/target gaps. Use when: 'create unity rules', 'generate analyze rules', 'fill sparse runtime gap'."
---

# Unity Reduced Rule-Lab Authoring

This skill is the post-rollback workflow.

Primary path:

1. Gather user-confirmed exact source/target pair(s).
2. Curate/promote to `rules/approved/*.yaml`.
3. Compile approved rules.
4. Re-run analyze and verify via CLI graph checks (not MCP session query/context).

`gap-lab` is migration history only and is not part of active operator guidance.

Read first:

- `gitnexus/skills/_shared/unity-rule-authoring-contract.md`
- `docs/unity-runtime-process-source-of-truth.md`
- `docs/gap-lab-rule-lab-architecture.md`

## Hard Boundaries

1. Query-time runtime closure remains graph-only.
2. Event/delegate large-scale gaps are analyzer work, not rule-authoring work.
3. This skill is for sparse irregular gaps only.

## Input Contract (required)

Provide exact pair intent for each candidate:

- source class + source method
- target class + target method
- expected missing runtime hop

If anchors are ambiguous (multiple candidate methods/classes), stop and ask user to choose explicit options. Do not auto-guess.

## Direct Public Flow

### Phase A: Prepare exact pairs

1. Confirm repo and index freshness.
2. Normalize candidate pairs into explicit source/target tuples.
3. Run duplicate precheck against `.gitnexus/rules/approved/*.yaml`.

### Phase B: Review and curate

```bash
gitnexus rule-lab analyze --repo-path "$REPO_PATH"
RUN_ID="$(ls -1t "$REPO_PATH/.gitnexus/rules/lab/runs" | head -n 1)"
SLICE_ID="$(find "$REPO_PATH/.gitnexus/rules/lab/runs/$RUN_ID/slices" -name 'slice.json' -maxdepth 2 | head -n 1 | xargs -I{} basename "$(dirname "{}")")"
gitnexus rule-lab review-pack --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
gitnexus rule-lab curate --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID" --input-path "$CURATION_JSON_PATH"
```

Use `analyze` as proposal generation for exact pairs, then curate/promote only proposals that pass guards.
Do not ask users to provide `run-id`/`slice-id`; resolve them from generated artifacts.

### Phase C: Promote approved rule

```bash
gitnexus rule-lab promote --repo-path "$REPO_PATH" --run-id "$RUN_ID" --slice-id "$SLICE_ID"
```

### Phase D: Compile and re-index

```bash
gitnexus rule-lab compile --repo-path "$REPO_PATH" --family analyze_rules
gitnexus analyze -f "$REPO_PATH"
```

## Three Mandatory Guards

1. Duplicate-prevention:
   - Block if pair already covered by `rules/approved/*.yaml`.
2. Fail-closed binding resolution:
   - Block if unresolved binding remains.
   - `UnknownClass` / `UnknownMethod` placeholders are forbidden.
3. Non-empty evidence before promote:
   - `confirmed_chain.steps` (or equivalent) must be non-empty.

## Verification

1. Verify synthetic edges with **CLI in a fresh process** (for example `gitnexus cypher` / `gitnexus query`).
2. Do not use current MCP session `query/context` as synthetic-edge acceptance evidence immediately after analyze/rebuild.
3. Inspect analyze summary `rule_binding.*` diagnostics:
   - `rule_binding.agent_report: should_report=false` → no anomaly to report.
   - `rule_binding.agent_report: should_report=true` → summarize `rule_binding.anomaly:*` in your run report.
4. Keep closure claims aligned to graph-only semantics.
5. Under `hydration_policy=strict` with `fallbackToCompact=true`, run parity before final closure conclusion.

Suggested acceptance check (example):

```bash
gitnexus cypher --repo "$REPO_ALIAS" \
  "MATCH (a)-[r:CodeRelation {type:'CALLS'}]->(b)
   WHERE r.reason STARTS WITH 'unity-rule-'
   RETURN a.name, b.name, r.reason
   LIMIT 50"
```

## Legacy Note

If historical `.gitnexus/gap-lab/runs/**` artifacts exist, treat them as migration evidence only. Do not require gap-lab parity/coverage gates for direct `approved -> compile -> analyze -> CLI validation` loops.
