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
    const skillPath = path.join(repoPath, '.agents', 'skills', 'gitnexus', 'gitnexus-exploring', 'SKILL.md');
    const sharedRuntimeContractPath = path.join(
      repoPath,
      '.agents',
      'skills',
      'gitnexus',
      '_shared',
      'unity-runtime-process-contract.md',
    );
    const legacyClaudeSkillsDir = path.join(repoPath, '.claude', 'skills');

    const agentsContent = await fs.readFile(agentsPath, 'utf-8');
    const claudeContent = await fs.readFile(claudePath, 'utf-8');
    await fs.access(skillPath);
    await fs.access(sharedRuntimeContractPath);

    expect(agentsContent).toMatch(/slim guidance is narrowing-first/);
    expect(agentsContent).toMatch(/Query-time runtime closure is graph-only/);
    expect(agentsContent).toMatch(/\.agents\/skills\/gitnexus\/gitnexus-exploring\/SKILL\.md/);
    expect(claudeContent).toMatch(/\.agents\/skills\/gitnexus\/gitnexus-exploring\/SKILL\.md/);
    expect(agentsContent).not.toMatch(/## Unity Runtime Process 真理源/);
    expect(claudeContent).not.toMatch(/## Unity Runtime Process 真理源/);
    expect(agentsContent).not.toMatch(/## Dev Workflow \(Source Build\)/);
    expect(claudeContent).not.toMatch(/## Dev Workflow \(Source Build\)/);
    expect(agentsContent).toBe(claudeContent,'AGENTS.md and CLAUDE.md should stay content-identical');
    expect(result.files.some((entry) => entry.includes('.agents/skills/gitnexus/'))).toBeTruthy();

    await expect(fs.access(legacyClaudeSkillsDir)).rejects.toThrow();
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
    const localSkillsDir = path.join(repoPath, '.agents', 'skills', 'gitnexus');

    const agentsContent = await fs.readFile(agentsPath, 'utf-8');
    const claudeContent = await fs.readFile(claudePath, 'utf-8');

    expect(agentsContent).toMatch(/slim guidance is narrowing-first/);
    expect(agentsContent).toMatch(/Query-time runtime closure is graph-only/);
    expect(agentsContent).toMatch(/~\/\.agents\/skills\/gitnexus\/gitnexus-exploring\/SKILL\.md/);
    expect(claudeContent).toMatch(/~\/\.agents\/skills\/gitnexus\/gitnexus-exploring\/SKILL\.md/);
    expect(agentsContent).not.toMatch(/## Unity Runtime Process 真理源/);
    expect(claudeContent).not.toMatch(/## Unity Runtime Process 真理源/);
    expect(agentsContent).not.toMatch(/## Dev Workflow \(Source Build\)/);
    expect(claudeContent).not.toMatch(/## Dev Workflow \(Source Build\)/);
    expect(agentsContent).toBe(claudeContent,'AGENTS.md and CLAUDE.md should stay content-identical');
    expect(!result.files.some((entry) => entry.includes('.agents/skills/gitnexus/'))).toBeTruthy();

    await expect(fs.access(localSkillsDir)).rejects.toThrow();
  } finally {
    await fs.rm(repoPath, { recursive: true, force: true });
  }
});
