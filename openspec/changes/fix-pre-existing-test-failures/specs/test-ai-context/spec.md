# Specification Delta

## Capability 对齐（已确认）

- Capability: `test-ai-context`
- 来源: `proposal.md` / 已确认 capabilities
- 变更类型: `modified`
- 用户确认摘要: 已确认

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件
- 项目页面回写不得替代本文件

## MODIFIED Requirements

### Requirement: ai-context-claude-md-template
The test SHALL expect the generated CLAUDE.md content to match the current `generateAIContextFiles()` output format: `gitnexus:start/end` block with `## Always Start Here` heading, skill routing table, and `## Resources` section, not the old format with `"If any GitNexus tool warns the index is stale"` preamble.

#### Scenario: test/unit/ai-context.test.ts — section preservation
- **WHEN** `generateAIContextFiles()` is called with sample stats
- **THEN** CLAUDE.md MUST contain `gitnexus:start`, `gitnexus:end`, `## Always Start Here`, skill routing entries, and `gitnexus://repo/TestProject/context` resource URI
- **THEN** CLAUDE.md MUST NOT contain the old preamble `"If any GitNexus tool warns the index is stale"`

### Requirement: ai-context-skip-agents-md-behavior
The test SHALL align `skipAgentsMd` assertions with current `generateAIContextFiles()` return structure, which does not include skip reason strings in the `files` array.

#### Scenario: test/unit/ai-context.test.ts — skip agents md
- **WHEN** `generateAIContextFiles()` is called with `skipAgentsMd: true`
- **THEN** AGENTS.md and CLAUDE.md MUST be preserved (not overwritten)
- **THEN** `result.files` MUST NOT contain skip reason entries like `"AGENTS.md (skipped via --skip-agents-md)"`

### Requirement: ai-context-global-skill-relative-path
When `skillScope: 'global'`, the generated AGENTS.md/CLAUDE.md SHALL use relative paths (`.agents/skills/gitnexus/...`) instead of `~/` absolute paths for skill file references.

#### Scenario: src/cli/ai-context.test.ts — global scope skill path
- **WHEN** `generateAIContextFiles()` is called with `skillScope: 'global'`
- **THEN** AGENTS.md and CLAUDE.md MUST contain `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md` (without `~/` prefix)
