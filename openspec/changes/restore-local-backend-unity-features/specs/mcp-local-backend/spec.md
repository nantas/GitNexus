# Specification Delta

## Capability 对齐（已确认）

- Capability: `mcp-local-backend`
- 来源: `proposal.md` / Modified Capabilities
- 变更类型: `modified`
- 用户确认摘要: ✅ 三项全选确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: Unity Context Query with Hydration
The system SHALL support Unity-specific context queries that return resource bindings with lazy hydration expansion and parity verification when querying a Unity repository via the local backend.

#### Scenario: Unity context retrieval with resource bindings
- **WHEN** `context` tool is called on a Unity repo with `symbol=<MonoBehaviour>`
- **THEN** the response SHALL include `resourceBindings`, `serializedFields`, `unityDiagnostics`, and `hydrationMeta` sections
- **AND** resource bindings SHALL be hydrated through the lazy hydrator module when requested hydration mode is `compact` or `strict`

#### Scenario: lazy hydration expansion with budget
- **WHEN** `context` is called with `hydration=strict` on a Unity runtime symbol
- **THEN** resource bindings SHALL be expanded on-demand via `hydrateLazyBindings()` with configurable `lazyMaxPaths`, `lazyBatchSize`, and `lazyMaxMs` budgets
- **AND** in-flight hydration for the same dedupe key SHALL be deduplicated

#### Scenario: parity hydration verification
- **WHEN** `query/context` is called with `hydration=parity`
- **THEN** the system SHALL execute a parity rerun that compares verifier-core results with policy-adjusted results
- **AND** parity results SHALL be cached in `unity-parity-cache` for the indexed commit
- **AND** warmup queue SHALL prefetch parity hydration results for common symbols

### Requirement: Lazy Overlay Cache Persistence
The system SHALL persist lazy hydration results to a sharded JSON overlay cache under `.gitnexus/unity-lazy-overlay/` indexed by commit hash.

#### Scenario: cross-session overlay reuse
- **WHEN** a Unity symbol is queried with lazy hydration in a new session
- **AND** the same commit is still indexed
- **THEN** previously hydrated bindings SHALL be read from the overlay cache
- **AND** cache entries SHALL be invalidated when the indexed commit changes

#### Scenario: shard-based cache organization
- **WHEN** overlay cache is written
- **THEN** entries SHALL be organized into shard files by SHA1 prefix of `{symbolUid}::{resourcePath}`
- **AND** each shard SHALL contain a `version` field and `indexedCommit` field for validation

### Requirement: Agent-Safe Response Envelope
The system SHALL produce agent-safe response envelopes for Unity runtime queries via the `query` tool, including confidence scores, evidence mode indicators, and disambiguation candidates.

#### Scenario: response with confidence fields
- **WHEN** a Unity runtime chain query is executed
- **THEN** the response SHALL include `confidence` with `verifier-core` (binary) and `policy-adjusted` (external) sub-fields
- **AND** `evidence` SHALL include evidence mode status, missing proof targets, and retrieval metadata

#### Scenario: parity ambiguity scenario
- **WHEN** parity verification detects a discrepancy between verifier-core and policy-adjusted results
- **THEN** `policy-adjusted` SHALL be downgraded to `verified_partial` or `verified_segment`
- **AND** `hydrationMeta.needsParityRetry` SHALL be set to `true`

### Requirement: Response Profile Support
The system SHALL support `response_profile=slim` (default) and `response_profile=full` for controlling response verbosity in Unity context queries. The `full` profile SHALL include hydration diagnostics and parity data.

#### Scenario: full response profile
- **WHEN** `context` is called with `response_profile=full` on a Unity symbol
- **THEN** the response SHALL include `hydrationMeta` with elapsedMs, fallbackToCompact, resourceBindingCount, completenessReason, and needsParityRetry
- **AND** parity status and detailed evidence SHALL be included

#### Scenario: slim response profile
- **WHEN** `context` is called with `response_profile=slim` (default)
- **THEN** `hydrationMeta` SHALL be omitted from the response
- **AND** `resourceBindings` and `serializedFields` SHALL still be populated

### Requirement: Cypher Workflow Execution for Runtime Chains
The system SHALL support pre-defined Cypher workflow execution for Unity runtime process queries via `query/context` with cypher-based evidence collection.

#### Scenario: runtime chain cypher workflow
- **WHEN** `query/context` matches a known Unity runtime process (e.g., Reload, GunGraph)
- **THEN** the corresponding Cypher workflow SHALL execute to collect evidence edges
- **AND** next-hops and gaps SHALL be synthesized into `workflows.debugging` / `workflows.exploring` in the response

### Requirement: Seed-Loader Parity Warmup
The system SHALL support loading Unity parity seeds from benchmark data for warmup, enabling cache pre-population before interactive queries.

#### Scenario: parity seed preload
- **WHEN** a Unity repo is queried for the first time after index
- **THEN** parity warmup queue SHALL load seeds from `loadUnityParitySeed()` if available
- **AND** warmup SHALL execute asynchronously to avoid blocking the first query response
