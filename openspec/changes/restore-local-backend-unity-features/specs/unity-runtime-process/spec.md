# Specification Delta

## Capability 对齐（已确认）

- Capability: `unity-runtime-process`
- 来源: `proposal.md` / Modified Capabilities
- 变更类型: `modified`
- 用户确认摘要: ✅ 三项全选确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: Post-Merge Unity Analyze Consistency
The system SHALL produce Unity resource bindings and derived processes consistent with the pre-merge fork behavior after re-integration, using the same Unity source modules that existed before the merge.

#### Scenario: Unity analyze with resource bindings
- **WHEN** `gitnexus analyze` is run on a Unity project with Unity resource scanning enabled
- **THEN** the pipeline SHALL execute Unity-specific stages that produce `UNITY_COMPONENT_INSTANCE`, `UNITY_SERIALIZED_TYPE_IN`, and `UNITY_RESOURCE_SUMMARY` synthetic edges
- **AND** the number and structure of synthetic edges SHALL match the pre-merge fork baseline

#### Scenario: resolved binding equivalence
- **WHEN** a Unity resource binding is resolved via `resolveUnityBindings()`
- **THEN** the binding SHALL include `sourceName`, `targetName`, `bindingType`, `confidence`, and `filePath`
- **AND** resolver logic from `gitnexus/src/core/unity/resolver.ts` SHALL be unchanged

### Requirement: Unity Runtime Chain Query End-to-End
The system SHALL support end-to-end Unity runtime chain queries through the MCP local backend, from graph edge retrieval through hydration to runtime chain evidence construction.

#### Scenario: end-to-end chain query
- **WHEN** `query` is called with a Unity runtime symbol name (e.g., "Reload")
- **THEN** the response SHALL include Unity hydration payload (resourceBindings + serializedFields)
- **AND** SHALL include the process workflow evidence if `runtime-chain-verify` mode is enabled
- **AND** the response envelope SHALL conform to the agent-safe format

### Requirement: Hydration Policy Compliance
The system SHALL respect the `hydration_policy` configuration when executing Unity hydration, with `strict` policy producing full hydration and `balanced` or `compact` mode respecting environment setting.

#### Scenario: strict policy produces full parity
- **WHEN** `hydration_policy=strict` and the symbol is in parity cache
- **THEN** `policy-adjusted` SHALL be `verified_full` with all resource bindings expanded
- **AND** no `fallbackToCompact` SHALL occur in `hydrationMeta`

#### Scenario: strict policy fallback
- **WHEN** `hydration_policy=strict` but `hydrationMeta.fallbackToCompact=true` due to budget exceeded
- **THEN** `policy-adjusted` SHALL be downgraded to `verified_partial` or `verified_segment`
- **AND** a parity rerun SHALL be triggered to verify the truncated result

### Requirement: Parity Cache Invalidation
The system SHALL invalidate parity cache entries when the indexed commit changes, ensuring stale parity data is not served across analyze runs.

#### Scenario: cache clear on re-index
- **WHEN** a Unity repo is re-analyzed with a new commit hash
- **THEN** the parity cache SHALL be cleared for that repo
- **AND** new parity entries SHALL be created during subsequent queries

#### Scenario: cache reuse within same commit
- **WHEN** the same symbol is queried twice without re-analysis
- **THEN** the second query SHALL read from the parity cache
- **AND** SHALL NOT re-execute full parity hydration
