/**
 * AI Context Generator
 *
 * Creates AGENTS.md and CLAUDE.md with full inline GitNexus context.
 * AGENTS.md is the standard read by Cursor, Windsurf, OpenCode, Codex, Cline, etc.
 * CLAUDE.md is for Claude Code which only reads that file.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { type GeneratedSkillInfo } from './skill-gen.js';
import { logger } from '../core/logger.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
type SkillScope = 'project' | 'global';

interface RepoStats {
  files?: number;
  nodes?: number;
  edges?: number;
  communities?: number;
  clusters?: number; // Aggregated cluster count (what tools show)
  processes?: number;
}

export interface AIContextOptions {
  skipAgentsMd?: boolean;
  noStats?: boolean;
}

const GITNEXUS_START_MARKER = '<!-- gitnexus:start -->';
const GITNEXUS_END_MARKER = '<!-- gitnexus:end -->';

/**
 * Find the index of a section marker that occupies its own line.
 * Unlike `indexOf`, this rejects inline prose references like
 * `` See the `<!-- gitnexus:start -->` block `` that appear
 * mid-sentence (#1041). A marker counts as section-position only when:
 *   - preceded by newline or start-of-file, AND
 *   - followed by newline, `\r` (CRLF files), or end-of-file.
 * The generator always emits each marker alone on its line, so this
 * matches every legitimate section and none of the inline mentions.
 *
 * `startFrom` lets the end-marker lookup start after the already-found
 * start marker, avoiding a scan from 0 and guaranteeing we never pick
 * up an end marker that appears earlier in the file than the start.
 */
function findSectionMarkerIndex(content: string, marker: string, startFrom = 0): number {
  let idx = content.indexOf(marker, startFrom);
  while (idx !== -1) {
    const atLineStart = idx === 0 || content[idx - 1] === '\n';
    const endPos = idx + marker.length;
    const atLineEnd =
      endPos === content.length || content[endPos] === '\n' || content[endPos] === '\r';
    if (atLineStart && atLineEnd) return idx;
    idx = content.indexOf(marker, idx + 1);
  }
  return -1;
}

/**
 * Generate the full GitNexus context content.
 *
 * Design principles (learned from real agent behavior and industry research):
 * - Inline critical workflows — skills are skipped 56% of the time (Vercel eval data)
 * - Use RFC 2119 language (MUST, NEVER, ALWAYS) — models follow imperative rules
 * - Three-tier boundaries (Always/When/Never) — proven to change model behavior
 * - Keep under 120 lines — adherence degrades past 150 lines
 * - Exact tool commands with parameters — vague directives get ignored
 * - Self-review checklist — forces model to verify its own work
 */
function generateGitNexusContent(
  projectName: string,
  stats: RepoStats,
  skillScope: SkillScope,
  generatedSkills?: GeneratedSkillInfo[],
): string {
  const skillRoot = skillScope === 'global'
    ? '~/.agents/skills/gitnexus'
    : '.agents/skills/gitnexus';
  const generatedRows = (generatedSkills && generatedSkills.length > 0)
    ? `\n${generatedSkills.map((s) =>
      `| Work in the ${s.label} area (${s.symbolCount} symbols) | \`.claude/skills/generated/${s.name}/SKILL.md\` |`,
    ).join('\n')}`
    : '';

  return `${GITNEXUS_START_MARKER}
# GitNexus MCP

## Always Start Here

1. **Read \`gitnexus://repo/{name}/context\`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**
4. **Follow config/state file rules:** \`docs/gitnexus-config-files.md\`
5. **If user asks to release/publish a specific version and this repo has \`DISTRIBUTION.md\`, execute that workflow in full-release mode by default** (unless user explicitly asks \`prepare-only\` or \`publish-only\`).

> If step 1 warns the index is stale, ask user whether to rebuild index via \`gitnexus analyze\` when local CLI exists; otherwise resolve the pinned npx package spec from \`~/.gitnexus/config.json\` (\`cliPackageSpec\` first, then \`cliVersion\`) and run \`npx -y <resolved-spec> analyze\` (it reuses previous analyze scope/options by default; add \`--no-reuse-options\` to reset). If user declines, explicitly warn that retrieval may not reflect current codebase. For build/analyze/test commands, use a 10-30 minute timeout; on failure/timeout, report exact tool output and do not auto-retry or silently fall back to glob/grep.
> \`query/context\` slim guidance is narrowing-first: inspect \`decision.recommended_follow_up\`, \`missing_proof_targets\`, and \`suggested_context_targets\` before upgrading to \`response_profile=full\`.
> Query-time runtime closure is graph-only and does not require \`verification_rules\` / \`trigger_tokens\`; if you need hydration diagnostics such as \`needsParityRetry\` or strict fallback state, rerun with \`response_profile=full\` and then use parity before closure claims.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | \`${skillRoot}/gitnexus-exploring/SKILL.md\` |
| Blast radius / "What breaks if I change X?" | \`${skillRoot}/gitnexus-impact-analysis/SKILL.md\` |
| Trace bugs / "Why is X failing?" | \`${skillRoot}/gitnexus-debugging/SKILL.md\` |
| Rename / extract / split / refactor | \`${skillRoot}/gitnexus-refactoring/SKILL.md\` |
| Tools, resources, schema reference | \`${skillRoot}/gitnexus-guide/SKILL.md\` |
| Index, status, clean, wiki CLI commands | \`${skillRoot}/gitnexus-cli/SKILL.md\` |
| Create Unity analyze_rules interactively | \`${skillRoot}/gitnexus-unity-rule-gen/SKILL.md\` |${generatedRows}

${GITNEXUS_END_MARKER}`;
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create or update GitNexus section in a file
 * - If file doesn't exist: create with GitNexus content
 * - If file exists without GitNexus section: append
 * - If file exists with GitNexus section: replace that section
 */
async function upsertGitNexusSection(
  filePath: string,
  content: string,
): Promise<'created' | 'updated' | 'appended'> {
  const exists = await fileExists(filePath);

  if (!exists) {
    await fs.writeFile(filePath, content, 'utf-8');
    return 'created';
  }

  const existingContent = await fs.readFile(filePath, 'utf-8');

  // Check if GitNexus section already exists. Matching is restricted
  // to markers that occupy their own line so that inline prose
  // references (e.g. `` See the `<!-- gitnexus:start -->` block `` in
  // the shipped CLAUDE.md) are NOT treated as section delimiters
  // (#1041). The end-marker scan starts after the start-marker so it
  // can never pick up an earlier end in the file.
  const startIdx = findSectionMarkerIndex(existingContent, GITNEXUS_START_MARKER);
  const endIdx = findSectionMarkerIndex(
    existingContent,
    GITNEXUS_END_MARKER,
    startIdx === -1 ? 0 : startIdx,
  );

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Replace existing section
    const before = existingContent.substring(0, startIdx);
    const after = existingContent.substring(endIdx + GITNEXUS_END_MARKER.length);
    const newContent = before + content + after;
    await fs.writeFile(filePath, newContent.trim() + '\n', 'utf-8');
    return 'updated';
  }

  // Append new section
  const newContent = existingContent.trim() + '\n\n' + content + '\n';
  await fs.writeFile(filePath, newContent, 'utf-8');
  return 'appended';
}

/**
 * Install repo-local GitNexus skills to .agents/skills/gitnexus/
 * AGENTS.md should reference this path consistently.
 */
async function installSkills(repoPath: string): Promise<string[]> {
  const skillsDir = path.join(repoPath, '.agents', 'skills', 'gitnexus');
  const installedSkills: string[] = [];
  const packageSkillsRoot = path.join(__dirname, '..', '..', 'skills');

  // Skill definitions bundled with the package
  const skills = [
    {
      name: 'gitnexus-exploring',
      description:
        'Use when the user asks how code works, wants to understand architecture, trace execution flows, or explore unfamiliar parts of the codebase. Examples: "How does X work?", "What calls this function?", "Show me the auth flow"',
    },
    {
      name: 'gitnexus-debugging',
      description:
        'Use when the user is debugging a bug, tracing an error, or asking why something fails. Examples: "Why is X failing?", "Where does this error come from?", "Trace this bug"',
    },
    {
      name: 'gitnexus-impact-analysis',
      description:
        'Use when the user wants to know what will break if they change something, or needs safety analysis before editing code. Examples: "Is it safe to change X?", "What depends on this?", "What will break?"',
    },
    {
      name: 'gitnexus-refactoring',
      description:
        'Use when the user wants to rename, extract, split, move, or restructure code safely. Examples: "Rename this function", "Extract this into a module", "Refactor this class", "Move this to a separate file"',
    },
    {
      name: 'gitnexus-guide',
      description:
        'Use when the user asks about GitNexus itself — available tools, how to query the knowledge graph, MCP resources, graph schema, or workflow reference. Examples: "What GitNexus tools are available?", "How do I use GitNexus?"',
    },
    {
      name: 'gitnexus-cli',
      description:
        'Use when the user needs to run GitNexus CLI commands like analyze/index a repo, check status, clean the index, generate a wiki, or list indexed repos. Examples: "Index this repo", "Reanalyze the codebase", "Generate a wiki"',
    },
    {
      name: 'gitnexus-unity-rule-gen',
      description: 'Use when the user wants to create Unity analyze_rules for a Unity project repo — interactively collecting chain clues, exploring the graph, generating rule YAML, compiling, and verifying. Examples: "Create unity rules", "Generate analyze rules", "Add resource binding rules for this Unity project"',
    },
  ];

  for (const skill of skills) {
    const skillDir = path.join(skillsDir, skill.name);
    const skillPath = path.join(skillDir, 'SKILL.md');

    try {
      // Create skill directory
      await fs.mkdir(skillDir, { recursive: true });

      // Try to read from package skills directory
      const packageSkillPath = path.join(packageSkillsRoot, `${skill.name}.md`);
      let skillContent: string;

      try {
        skillContent = await fs.readFile(packageSkillPath, 'utf-8');
      } catch {
        // Fallback: generate minimal skill content
        skillContent = `---
name: ${skill.name}
description: ${skill.description}
---

# ${skill.name.charAt(0).toUpperCase() + skill.name.slice(1)}

${skill.description}

Use GitNexus tools to accomplish this task.
`;
      }

      await fs.writeFile(skillPath, skillContent, 'utf-8');
      installedSkills.push(skill.name);
    } catch (err) {
      // Skip on error, don't fail the whole process
      logger.warn({ err }, `Warning: Could not install skill ${skill.name}:`);
    }
  }

  // Shared workflow contracts (if bundled).
  const packageSharedDir = path.join(packageSkillsRoot, '_shared');
  try {
    await fs.access(packageSharedDir);
    await copyDirRecursive(packageSharedDir, path.join(skillsDir, '_shared'));
  } catch {
    // Optional: older bundles may not include shared docs.
  }

  return installedSkills;
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Generate AI context files after indexing
 */
export async function generateAIContextFiles(
  repoPath: string,
  _storagePath: string,
  projectName: string,
  stats: RepoStats,
  options?: {
    skillScope?: SkillScope;
  },
  generatedSkills?: GeneratedSkillInfo[]
): Promise<{ files: string[] }> {
  const skillScope: SkillScope = options?.skillScope === 'global' ? 'global' : 'project';
  const content = generateGitNexusContent(
    projectName,
    stats,
    skillScope,
    generatedSkills,
  );
  const createdFiles: string[] = [];

  // Create AGENTS.md (standard for Cursor, Windsurf, OpenCode, Codex, Cline, etc.)
  const agentsPath = path.join(repoPath, 'AGENTS.md');
  const agentsResult = await upsertGitNexusSection(agentsPath, content);
  createdFiles.push(`AGENTS.md (${agentsResult})`);

    // Create CLAUDE.md (for Claude Code)
    const claudePath = path.join(repoPath, 'CLAUDE.md');
    const claudeResult = await upsertGitNexusSection(claudePath, content);
    createdFiles.push(`CLAUDE.md (${claudeResult})`);
  } else {
    createdFiles.push('AGENTS.md (skipped via --skip-agents-md)');
    createdFiles.push('CLAUDE.md (skipped via --skip-agents-md)');
  }

  // Install repo-local skills only when project scope is selected.
  if (skillScope === 'project') {
    const installedSkills = await installSkills(repoPath);
    if (installedSkills.length > 0) {
      createdFiles.push(`.agents/skills/gitnexus/ (${installedSkills.length} skills)`);
    }
  }

  return { files: createdFiles };
}
