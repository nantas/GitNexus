# Specification Delta

## Capability 对齐（已确认）

- Capability: `mcp-local-backend`
- 来源: `proposal.md` Capabilities → Modified
- 变更类型: modified
- 用户确认摘要: 已通过拆分方案确认，local-backend 辅助函数和 rule_lab wiring 需恢复

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: Next-Hops Command Templates
The `local-backend.ts` module SHALL export `buildNextHops` and `pickVerifierSymbolAnchor` functions that generate command templates for the next retrieval step. `buildNextHops` SHALL accept `seedPath`, `mappedSeedTargets`, `repoName`, and retrieval rule parameters. `pickVerifierSymbolAnchor` SHALL prefer non-heuristic, non-low-confidence process symbols over resource-heuristic anchors.

#### Scenario: buildNextHops includes repo in generated commands
- **WHEN** `buildNextHops` is called with `repoName: 'test-repo'`
- **THEN** generated next commands SHALL include `--repo test-repo`

#### Scenario: pickVerifierSymbolAnchor prefers structured anchors
- **WHEN** `pickVerifierSymbolAnchor` receives a query text and process symbols
- **THEN** it SHALL prefer structured symbol anchors over query text fallback

### Requirement: Evidence Gate
The `local-backend.ts` module SHALL export `computeVerifierMinimumEvidenceSatisfied` that evaluates evidence gate conditions. It SHALL return `false` when evidence rows are truncated or filter-exhausted, even if `verifier_minimum_evidence_satisfied` is `true`.

#### Scenario: Truncated evidence fails gate
- **WHEN** `computeVerifierMinimumEvidenceSatisfied` receives evidence with `truncated: true`
- **THEN** it SHALL return `false`

#### Scenario: Filter-exhausted evidence fails gate
- **WHEN** `computeVerifierMinimumEvidenceSatisfied` receives evidence with `filterExhausted: true`
- **THEN** it SHALL return `false`

### Requirement: Query Noise Controls
The `local-backend.ts` module SHALL export `filterBm25ResultsByScopePreset` and `rankExpandedSymbolsForQuery` functions for query noise filtering. `filterBm25ResultsByScopePreset` SHALL exclude common plugin-heavy Unity paths when scope is `unity-gameplay`. `rankExpandedSymbolsForQuery` SHALL rank gameplay symbols ahead of plugin symbols.

#### Scenario: Unity gameplay scope excludes plugin paths
- **WHEN** `filterBm25ResultsByScopePreset` is called with scope preset `'unity-gameplay'`
- **THEN** results from common plugin paths (e.g., `Plugins/`) SHALL be excluded

### Requirement: Rule Lab Tool Dispatch
The `LocalBackend.callTool` method SHALL recognize and dispatch `rule_lab_analyze`, `rule_lab_review_pack`, `rule_lab_curate`, `rule_lab_promote`, and `rule_lab_regress` tool calls to their respective handler methods.

#### Scenario: rule_lab_analyze is dispatched
- **WHEN** `callTool('rule_lab_analyze', { repo: 'test', run_id: 'r1', slice_id: 's1' })` is invoked
- **THEN** the corresponding `ruleLabAnalyze` method is called with the given parameters
- **THEN** no `Unknown tool` error is thrown
