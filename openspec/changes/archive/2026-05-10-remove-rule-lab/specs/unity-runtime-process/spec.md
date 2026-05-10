# Specification Delta

## Capability 对齐（已确认）

- Capability: `unity-runtime-process`
- 来源: `proposal.md`
- 变更类型: modified (remove rule-lab/gap-lab from source of truth)
- 用户确认摘要: 用户已确认从真理源文档中移除 rule-lab/gap-lab 相关章节

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: Pipeline Phase Definition

The `unity-runtime-process-source-of-truth.md` SHALL define the analyze-side pipeline as a three-stage sequence:
- Phase 5.5: processUnityResources (UNITY_COMPONENT_INSTANCE / UNITY_ASSET_GUID_REF edges)
- Phase 5.6: applyUnityLifecycleSyntheticCalls (lifecycle synthetic CALLS)
- Phase 6: processProcesses (CALLS-based trace → Process nodes)

Phase 5.7 (applyUnityRuntimeBindingRules) SHALL be removed entirely as the rule-lab system is deprecated.

#### Scenario: Pipeline phases are listed without rule-lab
- **WHEN** a developer reads the pipeline phase list
- **THEN** Phase 5.7 SHALL NOT appear
- **THEN** no reference to `rule-lab`, `analyze_rules`, or `compile` SHALL appear

### Requirement: On-Demand Verification Description

The source of truth SHALL describe on-demand verification as graph-only closure without rule-catalog matching. It SHALL NOT reference rule-lab or verification_rules as part of the query-time verification path.

#### Scenario: Verification described as graph-only
- **WHEN** a developer reads the on-demand verification section
- **THEN** it SHALL state that query-time runtime closure is graph-only
- **THEN** it SHALL NOT claim any rule-catalog matching at query time

## REMOVED Requirements

### Requirement: Phase 5 Offline Rule Lab

**Reason**: The reduced rule-lab workflow (analyze → review-pack → curate → promote → regress) is no longer part of the Unity runtime process architecture. All rule-lab lifecycle, artifact paths, guards, compile steps, and promote workflows are removed.

**Migration**: No migration needed — the system has not depended on rule-lab functionality since the April 2026 rollback. All `rule_lab_*` MCP tools and CLI commands will return `Unknown tool` / `Unknown command` errors.

### Requirement: Rule Authoring Boundary (Post-Rollback)

**Reason**: §2.5 of the source of truth (Rule Authoring Boundary, gap-lab migration notes, 3 guards, compile/validate loops) is no longer relevant. All authoring workflow references are removed.

### Requirement: Configuration Parameters (rule-lab related)

**Reason**: V2 configuration parameters related to rule-lab (`enableContainerNodes`, `payloadMode`, `parityWarmup`, `parityWarmupMaxParallel`) are removed as they only apply to rule-lab-driven synthetic edge injection.

### Requirement: Phase 5 Offline Rule Lab Contract (§4.4)

**Reason**: The complete §4.4 contract (Rule Lab lifecycle, artifact paths, 3 guards, compile/validate) is removed from the source of truth.

## RENAMED Requirements

- FROM: `§5.1 Behavior Control` (referenced lifecycle and rule-lab config)
- TO: `§5 Behavior Control` (simplified to lifecycle auto-detection only)
