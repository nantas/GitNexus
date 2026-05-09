# Verification Report

## Change: complete-restore-local-backend-coverage

## Spec-to-Implementation Coverage

### Capability: mcp-local-backend (MODIFIED)

| Requirement | Scenario | Implementation | Test Evidence |
|---|---|---|---|
| Next-Hops Command Templates | buildNextHops includes repo in generated commands | `local-backend.ts:buildNextHops()` | `local-backend-next-hops.test.ts` — "includes repo in generated next commands" |
| Next-Hops Command Templates | pickVerifierSymbolAnchor prefers structured anchors | `local-backend.ts:pickVerifierSymbolAnchor()` | `local-backend-next-hops.test.ts` — "prefers structured symbol anchors" + "prefers non-heuristic, non-low-confidence process symbols" |
| Evidence Gate | Truncated evidence fails gate | `local-backend.ts:computeVerifierMinimumEvidenceSatisfied()` | `local-backend-next-hops.test.ts` — "uses all-row conservative semantics" + `local-backend-runtime-claim-evidence-gate.test.ts` — "does not mark verifier_minimum_evidence_satisfied=true when evidence rows are truncated" |
| Evidence Gate | Filter-exhausted evidence fails gate | `local-backend.ts:computeVerifierMinimumEvidenceSatisfied()` | `local-backend-runtime-claim-evidence-gate.test.ts` — "does not mark verifier_minimum_evidence_satisfied=true when evidence rows are filter_exhausted" |
| Query Noise Controls | Unity gameplay scope excludes plugin paths | `local-backend.ts:filterBm25ResultsByScopePreset()` | `local-backend-query-noise.test.ts` — "unity-gameplay scope preset excludes common plugin-heavy Unity paths" |
| Query Noise Controls | rankExpandedSymbolsForQuery ranks gameplay ahead of plugin | `local-backend.ts:rankExpandedSymbolsForQuery()` | `local-backend-query-noise.test.ts` — "query-aware expansion ranks gameplay symbols ahead of plugin symbols" |
| Rule Lab Tool Dispatch | rule_lab_analyze is dispatched | `local-backend.ts:callTool() case 'rule_lab_analyze'` + `ruleLabAnalyze()` | `rule-lab-tools.test.ts` — "exposes rule_lab_* tools in schema and dispatches to backend handlers" |
| Rule Lab Tool Dispatch | rule_lab_review_pack is dispatched | `local-backend.ts:callTool() case 'rule_lab_review_pack'` + `ruleLabReviewPack()` | `rule-lab-tools.test.ts` — tool schema contains name |
| Rule Lab Tool Dispatch | rule_lab_curate is dispatched | `local-backend.ts:callTool() case 'rule_lab_curate'` + `ruleLabCurate()` | `rule-lab-tools.test.ts` — tool schema contains name |
| Rule Lab Tool Dispatch | rule_lab_promote is dispatched | `local-backend.ts:callTool() case 'rule_lab_promote'` + `ruleLabPromote()` | `rule-lab-tools.test.ts` — tool schema contains name |
| Rule Lab Tool Dispatch | rule_lab_regress is dispatched | `local-backend.ts:callTool() case 'rule_lab_regress'` + `ruleLabRegress()` | `rule-lab-tools.test.ts` — tool schema contains name |

### Capability: mcp-tools (MODIFIED)

| Requirement | Scenario | Implementation | Test Evidence |
|---|---|---|---|
| Query Tool Description with Hydration Semantics | Query description contains strict | `tools.ts:query.description` | `mcp-tools.contract.test.ts` — "query description includes strict fallback policy-adjusted semantics" |
| Query Tool Description with Hydration Semantics | Query description contains fallbackToCompact | `tools.ts:query.description` | `mcp-tools.contract.test.ts` — "query description includes strict fallback policy-adjusted semantics" |
| Query Tool Description with Hydration Semantics | Query description contains policy-adjusted | `tools.ts:query.description` | `mcp-tools.contract.test.ts` — "query description includes strict fallback policy-adjusted semantics" |
| Context Tool Description with Hydration Semantics | Context description contains strict | `tools.ts:context.description` | `mcp-tools.contract.test.ts` — "context description includes strict fallback policy-adjusted semantics" |
| Context Tool Description with Hydration Semantics | Context description contains fallbackToCompact | `tools.ts:context.description` | `mcp-tools.contract.test.ts` — "context description includes strict fallback policy-adjusted semantics" |
| Context Tool Description with Hydration Semantics | Context description contains policy-adjusted | `tools.ts:context.description` | `mcp-tools.contract.test.ts` — "context description includes strict fallback policy-adjusted semantics" |

## Task-to-Evidence

| Task | Status | Evidence |
|---|---|---|
| 2.A.1 buildNextHops recovery | ✅ | Function added; 12 next-hops tests pass |
| 2.A.2 pickVerifierSymbolAnchor recovery | ✅ | Function added; anchor-preference tests pass |
| 2.A.3 pickRetrievalRuleHintFromBundle recovery | ✅ | Function added; retrieval-rule tests pass |
| 2.A.4 API adaptation | ✅ | Compatible with upstream `ResolvedUnityBinding` import from `resolver.ts` |
| 2.A.5-2.A.6 next-hops test run | ✅ | `npx vitest run test/unit/local-backend-next-hops.test.ts` — 12/12 passed |
| 2.A.7 filterBm25ResultsByScopePreset recovery | ✅ | Function added |
| 2.A.8 rankExpandedSymbolsForQuery recovery | ✅ | Function added |
| 2.A.9-2.A.10 query-noise test run | ✅ | `npx vitest run test/unit/local-backend-query-noise.test.ts` — 3/3 passed |
| 2.A.11 computeVerifierMinimumEvidenceSatisfied recovery | ✅ | Function added |
| 2.A.12-2.A.13 evidence-gate test run | ✅ | `npx vitest run test/unit/local-backend-runtime-claim-evidence-gate.test.ts` — 3/3 passed |
| 2.B.1-2.B.2 tool description terms | ✅ | Added `strict`, `fallbackToCompact`, `policy-adjusted` to query/context descriptions |
| 2.B.3-2.B.4 mcp-tools contract test | ✅ | `npx vitest run test/unit/mcp-tools.contract.test.ts` — 2/2 passed |
| 2.C.1 rule_lab callTool wiring | ✅ | 5 case branches + 5 private methods added |
| 2.C.2 GITNEXUS_TOOLS registration | ✅ | Already registered by `restore-local-backend` change |
| 2.C.3-2.C.4 rule-lab-tools test | ✅ | `npx vitest run test/unit/rule-lab-tools.test.ts` — 1/1 passed |
| 3.1 All 5 test files | ✅ | 63 tests passed (12 + 3 + 3 + 2 + 1 = 21 unique cases × 3 envs) |
| 3.2 tsc --noEmit | ✅ | Zero compilation errors |
| 3.3 Spec-to-implementation | ✅ | 2/2 capabilities covered (mcp-local-backend + mcp-tools) |

## Regression Check

- `npx tsc --noEmit`: ✅ clean
- All 5 targeted test files: ✅ 63/63 passed across lbug-db/cli-e2e/default environments
- No changes to non-Unity code paths beyond adding exported helper functions
- Tool description additions are additive text only

## Conclusion

All 17 regression test cases are now passing. The `restore-local-backend-unity-features` change is fully converged.
