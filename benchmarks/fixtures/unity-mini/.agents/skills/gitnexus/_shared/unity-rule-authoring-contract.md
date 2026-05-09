# Unity Rule Authoring Contract

## Scope

This contract defines the stable public authoring workflow for
`gitnexus-unity-rule-gen`.

The only public path is direct rule authoring and validation:

`approved/*.yaml -> rule-lab compile -> analyze -> CLI validation`

## Workflow Position

1. `gap-lab` is historical context only and not part of the active workflow.
2. Default authoring path is reduced `rule-lab` for sparse irregular gaps.
3. Query-time runtime closure remains graph-only.

## Input Schema

Each authoring item must be an exact source/target pair (or explicit pair set):

- `source_class`
- `source_method`
- `target_class`
- `target_method`
- `expected_missing_hop` (short text)

If multiple anchors match, user must select the intended anchor explicitly.
Auto-guessing ambiguous anchors is forbidden.

## Mandatory Guards

1. Duplicate-prevention:
   - Block proposals already covered by `.gitnexus/rules/approved/*.yaml`.
2. Fail-closed binding resolution:
   - Unresolved bindings block progress.
   - `UnknownClass` / `UnknownMethod` placeholders are forbidden.
3. Non-empty evidence before promote:
   - `confirmed_chain.steps` (or equivalent) must be non-empty.

## Artifact Expectations

Primary artifacts are under `.gitnexus/rules/lab/runs/<run_id>/...`.

Run/slice identifiers are internal artifact locators. Public operator guidance must
not require run orchestration as the primary flow.

## Event/Delegate Boundary

Event/delegate system-wide coverage is analyzer-native scope:

- capture `assignment_expression` (`+=`, `-=`)
- index delegate/action field symbols
- capture generic event-type metadata (`Raise<T>` / `Listen<T>`)

Rule authoring is only for sparse, explicitly scoped residual gaps.

## Verification Contract

1. Promote only after mandatory guards pass.
2. Compile approved rules before analyze.
3. Verify in a fresh CLI process (`gitnexus cypher` / `gitnexus query`).
4. Under `hydration_policy=strict` with `fallbackToCompact=true`, parity rerun
   is required before final closure conclusion.
