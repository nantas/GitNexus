# Specification Delta

## Capability 对齐（已确认）

- Capability: `rule-lab`
- 来源: `proposal.md` / Modified Capabilities
- 变更类型: `modified`
- 用户确认摘要: 全选进行

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## MODIFIED Requirements

### Requirement: Functionality Preservation
The system SHALL preserve all rule-lab functionality unchanged: discover, compile, analyze, curate, promote, regress, and review-pack workflows.

#### Scenario: Rule discover
- **WHEN** `gitnexus rule-lab discover` is run
- **THEN** gap candidates SHALL be produced from the current graph state

### Requirement: Analyze Rules Compatibility
The system SHALL ensure that compiled rule bundles (`.gitnexus/rules/approved/*.yaml`) and the catalog (`.gitnexus/rules/catalog.json`) remain valid and functional after infrastructure merge.

#### Scenario: Rule compilation
- **WHEN** `gitnexus rule-lab compile` is run post-merge
- **THEN** rules SHALL compile without schema errors

### Requirement: Schema Stability
The system SHALL preserve the rule DSL schema (`src/rule-lab/schema/rule-dsl.schema.json`) and all binding kind definitions in `src/rule-lab/types.ts`.

#### Scenario: Binding kind completeness
- **WHEN** a rule with `kind: method_triggers_method` is compiled
- **THEN** the binding kind SHALL be recognized and synthetically processed
