# Unity Runtime Process Contract

Use this contract when analysis touches Unity runtime process semantics (runtime chain, lifecycle/loader stitching, or confidence-based closure).

## Trigger Conditions

Load this contract when any of the following is true:

- Query/debug/impact/refactor task requires Unity runtime process closure.
- Result contains Unity process evidence with `confidence` interpretation.
- Result has empty `processes` but Unity resource evidence is present.
- User asks for runtime-chain verification quality or closure certainty.

## Required Workflow

Use this order: `discovery -> seed narrowing -> closure verification`.

1. Run `query/context` with `unity_resources: "on"` and `unity_hydration_mode: "compact"` first.
   - For `response_profile=slim`, read semantic tiers in order: `facts -> closure -> clues`.
   - In strict-anchor mode, never let `clues` become the first-screen default when `facts` has high/medium leads.
2. If `hydrationMeta.needsParityRetry === true`, rerun with `unity_hydration_mode: "parity"` before conclusions.
3. Do not conclude "no runtime chain" from empty `processes` alone.
4. If Unity evidence exists, continue stitching:
   - `processes`
   - `resource_chains` for graph-backed `UNITY_ASSET_GUID_REF -> UNITY_GRAPH_NODE_SCRIPT_REF` bridges
   - `resourceBindings`
   - asset/meta mapping anchors
   - runtime candidate symbols
5. Treat low-confidence rows as unresolved unless `verification_hint` includes:
   - `action`
   - `target`
   - `next_command`
6. Semantic closure requires hop anchors/evidence anchors for each stitched step.
7. Treat `clues` as narrowing evidence (`clue`) and never as standalone closure proof.
8. Strong graph hops can coexist with failed closure; report as partial bridge evidence until verifier-core reaches `verified_full`.

## Optional Strong Verification

For Reload-focused confirmation, request on-demand verification:

- pass `runtime_chain_verify: "on-demand"` in MCP tools, or
- use CLI `--runtime-chain-verify on-demand`.
- `queryText` is not a verifier matching signal in graph-only mode; use structured anchors/resource evidence for closure.

When on-demand verification is used, report `runtime_chain.status`, `evidence_level`, `hops`, and `gaps` before final risk/closure statements.


## Runtime-Chain Closure Guard

- Treat runtime-chain outputs as two layers:
  - `verifier-core`: binary verifier result (`verified_full` | `failed`)
  - `policy-adjusted`: user-visible result after hydration policy is applied
- If `hydration_policy=strict` and `hydrationMeta.fallbackToCompact=true`, the result is downgraded policy-adjusted output and is not closure.
- In that downgraded state, rerun with parity before final conclusions.
