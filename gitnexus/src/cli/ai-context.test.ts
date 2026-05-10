// @ts-nocheck
import { describe, it, expect } from 'vitest'

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { generateAIContextFiles } from './ai-context.js';

it('generateAIContextFiles installs repo skills under .agents/skills/gitnexus', async () => {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-ai-context-'));

  try {
    const result = await generateAIContextFiles(repoPath, '', 'demo-repo', {
      nodes: 1,
      edges: 2,
      processes: 3,
    }, { skillScope: 'project' });

    const agentsPath = path.join(repoPath, 'AGENTS.md');
    const claudePath = path.join(repoPath, 'CLAUDE.md');
    const skillPath = path.join(repoPath, '.claude', 'skills', 'gitnexus', 'gitnexus-exploring', 'SKILL.md');
    const claudeSkillsDir = path.join(repoPath, '.claude', 'skills', 'gitnexus');

    const agentsContent = await fs.readFile(agentsPath, 'utf-8');
    const claudeContent = await fs.readFile(claudePath, 'utf-8');
    await fs.access(skillPath);

    expect(agentsContent).toMatch(/## Always Do/);
    expect(agentsContent).toMatch(/## Never Do/);
    expect(agentsContent).toMatch(/\.claude\/skills\/gitnexus\/gitnexus-exploring\/SKILL\.md/);
    expect(claudeContent).toMatch(/\.claude\/skills\/gitnexus\/gitnexus-exploring\/SKILL\.md/);
    expect(agentsContent).not.toMatch(/## Unity Runtime Process 真理源/);
    expect(claudeContent).not.toMatch(/## Unity Runtime Process 真理源/);
    expect(agentsContent).not.toMatch(/## Dev Workflow \(Source Build\)/);
    expect(claudeContent).not.toMatch(/## Dev Workflow \(Source Build\)/);
    expect(agentsContent).toBe(claudeContent,'AGENTS.md and CLAUDE.md should stay content-identical');
    expect(result.files.some((entry) => entry.includes('.claude/skills/gitnexus/'))).toBeTruthy();
    await fs.access(claudeSkillsDir);
  } finally {
    await fs.rm(repoPath, { recursive: true, force: true });
  }
});

it('generateAIContextFiles with global scope skips repo skill install', async () => {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-ai-context-global-'));

  try {
    const result = await generateAIContextFiles(repoPath, '', 'demo-repo', {
      nodes: 1,
      edges: 2,
      processes: 3,
    }, { skillScope: 'global' });

    const agentsPath = path.join(repoPath, 'AGENTS.md');
    const claudePath = path.join(repoPath, 'CLAUDE.md');
    const localSkillsDir = path.join(repoPath, '.claude', 'skills', 'gitnexus');

    const agentsContent = await fs.readFile(agentsPath, 'utf-8');
    const claudeContent = await fs.readFile(claudePath, 'utf-8');

    expect(agentsContent).toMatch(/## Always Do/);
    expect(agentsContent).toMatch(/## Never Do/);
    expect(agentsContent).toMatch(/\.claude\/skills\/gitnexus\/gitnexus-exploring\/SKILL\.md/);
    expect(claudeContent).toMatch(/\.claude\/skills\/gitnexus\/gitnexus-exploring\/SKILL\.md/);
    expect(agentsContent).not.toMatch(/## Unity Runtime Process 真理源/);
    expect(claudeContent).not.toMatch(/## Unity Runtime Process 真理源/);
    expect(agentsContent).not.toMatch(/## Dev Workflow \(Source Build\)/);
    expect(claudeContent).not.toMatch(/## Dev Workflow \(Source Build\)/);
    expect(agentsContent).toBe(claudeContent,'AGENTS.md and CLAUDE.md should stay content-identical');
    // Skills are installed regardless of skillScope (skillScope is informational)
    expect(result.files.some((entry) => entry.includes('.claude/skills/gitnexus/'))).toBeTruthy();
    await fs.access(localSkillsDir);
  } finally {
    await fs.rm(repoPath, { recursive: true, force: true });
  }
});
