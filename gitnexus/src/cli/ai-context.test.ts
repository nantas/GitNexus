// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { generateAIContextFiles } from './ai-context.js';

test('generateAIContextFiles installs repo skills under .agents/skills/gitnexus', async () => {
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

    assert.match(agentsContent, /slim guidance is narrowing-first/);
    assert.match(agentsContent, /Query-time runtime closure is graph-only/);
    assert.match(agentsContent, /\.agents\/skills\/gitnexus\/gitnexus-exploring\/SKILL\.md/);
    assert.match(claudeContent, /\.agents\/skills\/gitnexus\/gitnexus-exploring\/SKILL\.md/);
    assert.doesNotMatch(agentsContent, /## Unity Runtime Process 真理源/);
    assert.doesNotMatch(claudeContent, /## Unity Runtime Process 真理源/);
    assert.doesNotMatch(agentsContent, /## Dev Workflow \(Source Build\)/);
    assert.doesNotMatch(claudeContent, /## Dev Workflow \(Source Build\)/);
    assert.equal(agentsContent, claudeContent, 'AGENTS.md and CLAUDE.md should stay content-identical');
    assert.ok(
      result.files.some((entry) => entry.includes('.agents/skills/gitnexus/')),
      'expected generated file summary to include .agents/skills/gitnexus/',
    );

    await assert.rejects(fs.access(legacyClaudeSkillsDir));
  } finally {
    await fs.rm(repoPath, { recursive: true, force: true });
  }
});

test('generateAIContextFiles with global scope skips repo skill install', async () => {
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

    assert.match(agentsContent, /slim guidance is narrowing-first/);
    assert.match(agentsContent, /Query-time runtime closure is graph-only/);
    assert.match(agentsContent, /~\/\.agents\/skills\/gitnexus\/gitnexus-exploring\/SKILL\.md/);
    assert.match(claudeContent, /~\/\.agents\/skills\/gitnexus\/gitnexus-exploring\/SKILL\.md/);
    assert.doesNotMatch(agentsContent, /## Unity Runtime Process 真理源/);
    assert.doesNotMatch(claudeContent, /## Unity Runtime Process 真理源/);
    assert.doesNotMatch(agentsContent, /## Dev Workflow \(Source Build\)/);
    assert.doesNotMatch(claudeContent, /## Dev Workflow \(Source Build\)/);
    assert.equal(agentsContent, claudeContent, 'AGENTS.md and CLAUDE.md should stay content-identical');
    assert.ok(
      !result.files.some((entry) => entry.includes('.agents/skills/gitnexus/')),
      'did not expect repo-local skills in generated file summary',
    );

    await assert.rejects(fs.access(localSkillsDir));
  } finally {
    await fs.rm(repoPath, { recursive: true, force: true });
  }
});
