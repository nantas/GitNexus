<!-- gitnexus:start -->
# GitNexus MCP

This project is indexed by GitNexus as **GitNexus** (2225 symbols, 5345 relationships, 155 execution flows).

## Always Start Here

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, ask user whether to rebuild index via `npx -y gitnexus analyze` first (it reuses previous analyze scope/options by default; add `--no-reuse-options` to reset). If user declines, explicitly warn that retrieval may not reflect current codebase. For build/analyze/test commands, use a 10-30 minute timeout; on failure/timeout, report exact tool output and do not auto-retry or silently fall back to glob/grep.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.agents/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.agents/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.agents/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.agents/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
