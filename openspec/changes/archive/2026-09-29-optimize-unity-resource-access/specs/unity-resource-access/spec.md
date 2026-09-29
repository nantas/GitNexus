# Specification Delta

## Capability 对齐（已确认）

- Capability: `unity-resource-access`
- 来源: `proposal.md` New Capabilities
- 变更类型: new
- 用户确认摘要: 用户逐轮确认资源级 Module、语义保留、有界工作集、两阶段读取、必要临时暂存、无新增跨次缓存、文件级失败隔离、查询复用及四类验收。能力 ID 是上述已确认范围的规范名称。

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源。
- design / tasks / verification MUST 引用本文件；项目页面不得替代 spec delta。

## ADDED Requirements

### Requirement: TwoStageResourceDiscovery

The system SHALL separate lightweight discovery from resource-level semantic resolution, preserving configured resource scope and canonical script selection. Compatible script-GUID and prefab-source recognition SHALL share the discovery read without merging their identities or deduplication rules. Resource binding discovery MUST NOT be disabled by the File.content size limit.

#### Scenario: Canonical selection uses unique resource hits
- **WHEN** multiple script paths compete for a canonical symbol and one resource contains repeated occurrences of a script GUID
- **THEN** discovery SHALL count that resource once for that GUID and preserve the existing canonical scoring and stable tie-break ordering before associating bindings with symbols

#### Scenario: Independent prefab source signal
- **WHEN** a scoped prefab or scene contains a prefab-source reference but no selected script GUID
- **THEN** discovery SHALL retain the prefab-source fact independently of script-hit filtering

#### Scenario: Large and out-of-scope resources
- **WHEN** a scoped resource exceeds the File.content limit and another resource is outside the selected scope
- **THEN** the former SHALL remain eligible for resource facts and the latter SHALL NOT be added to the selected source set

### Requirement: ResourceLevelResolutionReuse

During analyze semantic resolution, the system SHALL process all selected scripts for each resource together. Increasing associated script count MUST NOT increase whole-source-file opens or parses for that resource. Discovery reads, semantic reads and temporary-record replay SHALL be accounted separately; a two-stage read is permitted. The consumer SHALL remain the graph writer.

#### Scenario: Multiple scripts through real discovery
- **WHEN** actual discovery produces hits for several canonical scripts in the same resource
- **THEN** analyze SHALL resolve their bindings from one semantic read/parse of that resource, rather than one per script

#### Scenario: Duplicate input and multiple instances
- **WHEN** repeated hit hints refer to a resource containing several instances of the same script
- **THEN** resolution SHALL preserve each distinct component once without duplicating bindings or rereading the source for each hint

### Requirement: PreserveResourceSemantics

The system SHALL preserve existing supported binding, scalar/reference field, local-object, list/array, override, serialized-type and AssetRefPath semantics. Large resources SHALL retain the existing lightweight capability, including ordinary serialized external GUID references, without default full-YAML deep parsing. Binding identity MUST distinguish resource, component objectId and script GUID. Each binding SHALL report its own script evidence location.

#### Scenario: Small resource semantics
- **WHEN** a selected small resource contains local references, lists and supported prefab modifications
- **THEN** resolved fields, reference targets, source layers, binding kinds and serialized-type inputs SHALL remain equivalent to the existing supported semantics

#### Scenario: Large resource component evidence
- **WHEN** a large resource contains multiple components with external GUID fields
- **THEN** lightweight resolution SHALL retain each component's external references and actual script line evidence, without assigning every component the first hit's line

#### Scenario: Identity normalization
- **WHEN** resources contain mixed-case GUIDs, negative object IDs or stripped objects
- **THEN** normalization SHALL preserve distinct valid objects and the existing reference resolution behavior

### Requirement: BoundedIntermediateWorkingSet

The resource Module SHALL enforce a byte-aware budget over its retained lightweight records, pending results and parse caches. It SHALL apply backpressure and release consumed state; temporary storage MAY retain necessary records when release alone cannot maintain the budget. It MUST NOT silently drop facts or fall back to unbounded in-memory accumulation. This contract does not cap final graph/database memory or the existing query deep-parser allocation.

#### Scenario: Slow consumer
- **WHEN** a slow consumer causes pending resource results to reach the configured budget
- **THEN** production SHALL pause, release eligible state or spill necessary records rather than grow an unbounded result array

#### Scenario: High-cardinality single resource
- **WHEN** one resource produces more lightweight records than the working-set budget permits
- **THEN** the Module SHALL deliver bounded batches or use temporary records without dropping bindings; a fixed file concurrency count alone SHALL NOT satisfy the budget

#### Scenario: Finished resource
- **WHEN** the consumer has completed a resource and no outstanding work requires its full parse/binding objects
- **THEN** those objects SHALL become releasable without waiting for the end of the whole analyze phase

### Requirement: RunScopedTemporaryStorage

Temporary records SHALL belong exclusively to one execution and SHALL NOT be reused as a cross-run resource cache. Memory and temporary-file storage SHALL preserve identical facts, ordering constraints and diagnostics. Normal completion, cancellation and failure SHALL close producers and clean owned temporary artifacts without deleting another run or existing index data.

#### Scenario: Spill parity
- **WHEN** the same resource workload executes below and above the in-memory budget
- **THEN** in-memory and spill execution SHALL produce equivalent resource facts and completeness results

#### Scenario: Early cancellation and storage failure
- **WHEN** consumption stops early or temporary storage cannot maintain record consistency
- **THEN** the Module SHALL release owned resources, clean owned artifacts where possible, report cleanup failures, and terminate inconsistent processing rather than retry with unbounded memory

#### Scenario: Later run
- **WHEN** a new analysis starts after a prior run or crash
- **THEN** it SHALL NOT consume the prior run's temporary records as valid cached resource facts; cleanup SHALL identify ownership before deleting residual artifacts

### Requirement: ExplicitResourceCompleteness

File-level read or parse failures SHALL be isolated and recorded with the affected resource and capability. The system SHALL continue independent resources and propagate incompleteness to the consumer and index publication/status result. A failed resource MUST NOT be represented as a verified empty reference set or a fully complete result. Failures compromising storage consistency SHALL terminate processing.

#### Scenario: One malformed resource
- **WHEN** one resource fails while other resources are readable
- **THEN** valid independent facts SHALL still be processed, and the published result SHALL identify incomplete resource analysis rather than reporting all resource capabilities complete

#### Scenario: Source changes between stages
- **WHEN** a resource changes between discovery and semantic resolution and consistent facts cannot be established
- **THEN** the affected result SHALL be explicitly incomplete rather than combining versions into a complete binding result

### Requirement: QueryAndPublicationCompatibility

Query/parity/lazy SHALL reuse resource-level parsing while preserving existing entry points, scheduling budgets, seed/overlay identity and invalidation, completeness policies and runtime-closure interpretation. A selected query MUST NOT require new whole-repository discovery. This change SHALL NOT introduce a new cross-run resource cache or change UI trace into build-time graph writing.

#### Scenario: Selected lazy query
- **WHEN** hydration selects a symbol and a bounded batch of resource paths
- **THEN** shared resolution SHALL operate on that selection while retaining existing lazy budgets and partial-result behavior

#### Scenario: Strict fallback
- **WHEN** strict hydration falls back to compact
- **THEN** existing policy-adjusted status and parity-rerun requirements SHALL remain unchanged; successful resource parsing SHALL NOT itself establish runtime closure

#### Scenario: Seed publication
- **WHEN** an index is published
- **THEN** seed generation SHALL preserve canonical and GUID/resource mappings under existing publication rules, without mistaking a temporary batch for the complete seed or collecting all streamed prefab-source rows merely to fill a legacy field

#### Scenario: Incremental derived phases
- **WHEN** analyze preserves or recomputes Unity derived phases
- **THEN** existing skip-phase, runtime-root cleanup and rewrite behavior SHALL remain, without duplicate derived graph facts

### Requirement: ObservableAccessCostAndAcceptance

The system SHALL expose phase costs and counters for unique resources, selected scripts, source opens/bytes, parses, pending working-set bytes, temporary I/O and failed resources. Validation SHALL exercise real discovery inputs through the Module Interface, compare semantic facts rather than raw counts alone, and verify both elapsed-time and memory improvement in controlled complete builds. Numeric performance thresholds SHALL be fixed after phase prototyping and before final acceptance.

#### Scenario: More scripts in one resource
- **WHEN** a test increases selected scripts while holding the resource set fixed
- **THEN** source-open/parse counters SHALL demonstrate the ResourceLevelResolutionReuse contract without using an arbitrary wall-clock unit-test threshold

#### Scenario: Full build comparison
- **WHEN** baseline and optimized builds are compared
- **THEN** evidence SHALL record runtime/build identity, target content, config, parser cache, write plan and system pressure, and SHALL include semantic equivalence, elapsed time and separately identified memory metrics
