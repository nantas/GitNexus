# Unity Incremental Input Consistency

## Purpose

Ensure Unity analysis reuses only complete, unchanged effective inputs, preserves resource facts through deferred graph construction, and safely publishes full rebuilds when inputs change. Define receipt migration, failure handling, observability, and semantic and performance acceptance.

## Requirements

### Requirement: CompleteAnalysisInputSnapshot
The system SHALL identify effective analysis inputs independently of partially constructed graph File nodes. A reusable snapshot MUST cover consumed source, metadata, Unity resources and semantic configuration under current scope/ignore rules, including additions absent from the previous receipt. Content identity and explicit completeness SHALL determine reuse; matching Git HEAD, clean status or mtimes alone MUST NOT prove unchanged inputs. Snapshot validation SHALL use bounded reads and SHALL NOT introduce a cross-run cache of parsed Unity facts.

#### Scenario: Deferred resource nodes
- **WHEN** Unity derived phases are deferred and current graph File nodes omit resources present on disk
- **THEN** those resources SHALL remain represented in the effective input snapshot and MUST NOT be classified as deleted due to phase ordering

#### Scenario: Newly added and large resources
- **WHEN** a selected new or untracked resource, a resource above the File.content limit, or a prefab-source-only resource is present
- **THEN** effective input discovery SHALL include it when the analyzer consumes it, regardless of whether the previous index had a File node for it

#### Scenario: Configuration and metadata changes
- **WHEN** scope, ignore rules, effective semantic configuration, script metadata GUIDs or consumed project inputs change
- **THEN** the system SHALL detect changed analysis inputs and MUST NOT reuse the old index as unchanged

### Requirement: FinalOutputInventory
The system SHALL distinguish analysis input inventory from the file inventory represented by the finalized graph. Publication and any destructive write plan MUST use a complete inventory appropriate to their purpose. Deferred graph mutation SHALL invalidate provisional output inventories and differences; they MUST NOT be published or executed unchanged. A candidate input need not have a graph node.

#### Scenario: Derived stages add File nodes
- **WHEN** deferred stages add resource File nodes after a provisional comparison
- **THEN** the finalized output inventory SHALL include those nodes before write planning and metadata publication, and obsolete provisional deletions MUST NOT execute

#### Scenario: Actual resource deletion
- **WHEN** a previously consumed resource is confirmed absent from a complete current discovery
- **THEN** the rebuilt graph and published inventory SHALL remove its obsolete facts without retaining them merely because its path existed in old metadata

### Requirement: UnchangedInputReuse
For a Unity index with a compatible complete receipt and no pending recovery obligations, the system SHALL reuse the successfully published index when validated effective inputs and analyzer/configuration identities are unchanged. It SHALL skip parse, scope resolution, Unity enrichment, graph writes and FTS rebuilds. Existing dirty working-tree content already represented by the receipt SHALL NOT itself defeat reuse. The unchanged decision MUST occur before those heavy stages.

#### Scenario: Same dirty working tree twice
- **WHEN** a successful full build is followed by two ordinary analyzes with exactly the same dirty content
- **THEN** both ordinary runs SHALL reuse the index without heavy stages or destructive writes, preserving graph facts, process members, complete inventories and seed

#### Scenario: Clean HEAD with changed consumed input
- **WHEN** Git HEAD and tracked-file status are unchanged but an ignored or external input consumed by analysis changes
- **THEN** the system MUST NOT declare the index unchanged based only on Git state

#### Scenario: Explicit rebuild or pending recovery
- **WHEN** force, parser-cache bypass, an incomplete index or pending embedding/recovery work requires processing
- **THEN** the unchanged fast path SHALL NOT bypass that obligation

### Requirement: SafeUnityChangeRebuild
In this change, a real effective-input change affecting a Unity analysis SHALL select a complete graph rebuild and the existing staged full-write publication path, preserving parser-cache reuse unless explicitly disabled. Selective resource writeback SHALL NOT be assumed safe. The previous complete index SHALL remain available until successful replacement; existing embedding preservation and recovery contracts SHALL continue to apply.

#### Scenario: Code changes with unchanged resources
- **WHEN** a C# change alters canonical selection or serialized-type associations while resource bytes remain unchanged
- **THEN** the full rebuilt result SHALL match an explicit full-build reference, including affected resource relationships

#### Scenario: Resource and GUID mutations
- **WHEN** a resource is added, changed, deleted or renamed, or a consumed metadata GUID changes
- **THEN** ordinary analyze SHALL safely rebuild and publish facts equivalent to force analysis of the same inputs, without stale, missing or duplicate resource facts

#### Scenario: Failed replacement
- **WHEN** a selected full rebuild fails before successful publication
- **THEN** the previous complete index SHALL remain recoverable and no new successful input receipt SHALL be published

### Requirement: IncompleteInputsAreNotDeletions
The system MUST distinguish unreadable or incompletely enumerated inputs from confirmed deletions. An incomplete input-validation result SHALL prevent destructive deletion planning and fresh-receipt publication. If inconsistent file versions are detected during analysis, the system SHALL explicitly fail or retain an incomplete result under existing contracts, MUST NOT publish it as eligible for unchanged reuse, and SHALL preserve the prior complete index where replacement has not succeeded.

#### Scenario: Read or enumeration failure
- **WHEN** a prior resource is unreadable or effective input enumeration fails
- **THEN** its absence from a hash map MUST NOT become a deletion; the run SHALL report validation failure and SHALL NOT replace the complete index on that basis

#### Scenario: Source changes during analysis
- **WHEN** validated input and subsequently consumed content cannot be shown consistent because a change is detected
- **THEN** the run SHALL NOT publish a complete reusable receipt for mixed-version facts

### Requirement: ReceiptMigrationAndPublication
The system SHALL version the successful-input receipt and require one complete repair rebuild when a Unity index lacks a compatible trustworthy receipt, including indexes possibly damaged by the old incremental behavior. A new receipt SHALL only certify the successfully published graph, metadata and seed from the same analysis. Existing recovery obligations MUST take precedence over freshness shortcuts.

#### Scenario: Apparently healthy old index
- **WHEN** an old Unity index has matching HEAD and no reported resource failures but no compatible receipt
- **THEN** analyze SHALL rebuild it once instead of trusting potentially missing resource facts, and subsequent unchanged runs SHALL become eligible for reuse

#### Scenario: Publication failure
- **WHEN** graph or associated publication work fails
- **THEN** the new receipt MUST NOT cause the incomplete replacement to appear fresh on the next invocation

### Requirement: CompatibilityAndObservability
The system SHALL preserve non-Unity incremental behavior, explicit CLI rebuild semantics, existing resource parsing and hydration semantics, and seed/runtime-root contracts. It SHALL expose the chosen reuse/rebuild decision and reason plus input-validation cost, parser-cache outcomes and relevant phase/write timings. Resource freshness bookkeeping SHALL NOT become a new parsed-resource cache.

#### Scenario: Non Unity analysis
- **WHEN** a non-Unity repository performs ordinary incremental analysis
- **THEN** this Unity repair policy SHALL NOT unconditionally force it into full rebuilds or change existing output semantics

#### Scenario: Explain rebuild decision
- **WHEN** a run reuses an index, repairs a legacy receipt or rebuilds for real input changes
- **THEN** diagnostics SHALL distinguish those reasons and include validation cost rather than hiding it outside reported command time

### Requirement: SemanticAndPerformanceAcceptance
Acceptance SHALL exercise real full-build-to-ordinary-rerun sequences and compare persisted normalized facts, ordered process membership, complete seed and relevant inventories, not only exit codes or counts. Performance evidence SHALL pin runtime, build, inputs, configuration, cache and write plan and report system pressure. No fixed 130-second guarantee is implied.

#### Scenario: No change regression
- **WHEN** the real CLI analyzes a temporary Unity repository fully and then reruns over identical dirty inputs
- **THEN** tests SHALL reject phantom deletions, missing resource facts or heavy-stage execution even if CLI exit status is zero and seed JSON is unchanged

#### Scenario: Controlled neonnew comparison
- **WHEN** cold-cache full, warm-cache full and two unchanged ordinary runs are evaluated on fixed neonnew inputs using isolated storage
- **THEN** all successful results SHALL preserve the reference facts and seed; unchanged runs SHALL skip heavy stages, with input checking included in timing and the normal project index left intact
