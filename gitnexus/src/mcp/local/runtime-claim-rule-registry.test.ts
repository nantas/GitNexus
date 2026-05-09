
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { RuleRegistryLoadError, loadRuleRegistry } from './runtime-claim-rule-registry.js';

it('loads active runtime claim rules from project catalog', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-runtime-claim-rules-'));
  const repoPath = path.join(tempRoot, 'repo');
  const rulesRoot = path.join(repoPath, '.gitnexus', 'rules');
  await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
  await fs.writeFile(
    path.join(rulesRoot, 'catalog.json'),
    JSON.stringify({
      rules: [
        {
          id: 'demo.reload.rule.v1',
          version: '1.2.3',
          file: 'approved/demo.reload.rule.v1.yaml',
        },
      ],
    }),
    'utf-8',
  );
  await fs.writeFile(
    path.join(rulesRoot, 'approved', 'demo.reload.rule.v1.yaml'),
    [
      'id: demo.reload.rule.v1',
      'version: 1.2.3',
      'trigger_family: reload',
      'resource_types:',
      '  - asset',
      'host_base_type:',
      '  - ReloadBase',
      'required_hops:',
      '  - resource',
      'guarantees:',
      '  - reload_chain_closed',
      'non_guarantees:',
      '  - no_runtime_execution',
      'next_action: gitnexus query "reload"',
    ].join('\n'),
    'utf-8',
  );

  try {
    const registry = await loadRuleRegistry(repoPath);
    expect(registry.activeRules[0].id).toBe('demo.reload.rule.v1');
    expect(registry.activeRules[0].version).toBe('1.2.3');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

it('throws rule_catalog_missing when target repo has no catalog (no ancestor fallback)', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-runtime-claim-rules-'));
  const workspaceRoot = path.join(tempRoot, 'workspace');
  const nestedCwd = path.join(workspaceRoot, 'packages', 'app');
  const rulesRoot = path.join(workspaceRoot, '.gitnexus', 'rules');
  const catalogPath = path.join(rulesRoot, 'catalog.json');

  await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
  await fs.mkdir(nestedCwd, { recursive: true });
  await fs.writeFile(
    catalogPath,
    JSON.stringify({
      rules: [
        {
          id: 'demo.reload.rule.v1',
          version: '1.2.3',
          file: 'approved/demo.reload.rule.v1.yaml',
        },
      ],
    }),
    'utf-8',
  );
  await fs.writeFile(
    path.join(rulesRoot, 'approved', 'demo.reload.rule.v1.yaml'),
    ['id: demo.reload.rule.v1', 'version: 1.2.3', 'trigger_family: reload'].join('\n'),
    'utf-8',
  );

  const originalCwd = process.cwd();
  process.chdir(nestedCwd);
  try {
    const loadError = await loadRuleRegistry(path.join(tempRoot, 'does-not-exist')).catch(e => e);
    expect(loadError).toBeInstanceOf(RuleRegistryLoadError);
    expect(loadError.code).toBe('rule_catalog_missing');
    expect(String(loadError.message || '')).toMatch(/catalog not found/i);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

it('throws rule_catalog_missing when rulesRoot exists but catalog.json is missing', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-runtime-claim-rules-'));
  const repoPath = path.join(tempRoot, 'repo');
  const rulesRoot = path.join(repoPath, '.gitnexus', 'rules');
  await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
  try {
    const loadError = await loadRuleRegistry(repoPath).catch(e => e);
    expect(loadError).toBeInstanceOf(RuleRegistryLoadError);
    expect(loadError.code).toBe('rule_catalog_missing');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

it('throws rule_file_missing when catalog entry points to missing yaml file', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-runtime-claim-rules-'));
  const repoPath = path.join(tempRoot, 'repo');
  const rulesRoot = path.join(repoPath, '.gitnexus', 'rules');
  await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
  await fs.writeFile(
    path.join(rulesRoot, 'catalog.json'),
    JSON.stringify({
      rules: [
        {
          id: 'demo.reload.rule.v1',
          version: '1.0.0',
          file: 'approved/demo.reload.rule.v1.yaml',
        },
      ],
    }),
    'utf-8',
  );
  try {
    const loadError = await loadRuleRegistry(repoPath).catch(e => e);
    expect(loadError).toBeInstanceOf(RuleRegistryLoadError);
    expect(loadError.code).toBe('rule_file_missing');
    expect(String(loadError.message || '')).toMatch(/rule file not found/i);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

it('parses scalar/list values with spaces, quotes, and escapes without truncation', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-runtime-claim-rules-'));
  const repoPath = path.join(tempRoot, 'repo');
  const rulesRoot = path.join(repoPath, '.gitnexus', 'rules');
  await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
  await fs.writeFile(
    path.join(rulesRoot, 'catalog.json'),
    JSON.stringify({
      rules: [
        {
          id: 'demo.scalar-parser.v1',
          version: '1.0.0',
          file: 'approved/demo.scalar-parser.v1.yaml',
        },
      ],
    }),
    'utf-8',
  );
  await fs.writeFile(
    path.join(rulesRoot, 'approved', 'demo.scalar-parser.v1.yaml'),
    [
      'id: demo.scalar-parser.v1',
      'version: 1.0.0',
      'trigger_family: reload',
      'resource_types:',
      '  - "asset ref"',
      "  - 'prefab ref'",
      'host_base_type:',
      "  - 'ReloadBase'",
      'required_hops:',
      '  - resource',
      'guarantees:',
      "  - 'guarantee with spaces'",
      'non_guarantees:',
      '  - "double-quote \\"inside\\""',
      "  - 'single-quote ''inside'''",
      'next_action: node gitnexus/dist/cli/index.js query --runtime-chain-verify on-demand "Reload NEON.Game.Graph.Nodes.Reloads"',
    ].join('\n'),
    'utf-8',
  );

  try {
    const registry = await loadRuleRegistry(repoPath);
    const rule = registry.activeRules[0];
    expect(rule.id).toBe('demo.scalar-parser.v1');
    expect(rule.resource_types).toEqual(['asset ref', 'prefab ref']);
    expect(rule.guarantees).toEqual(['guarantee with spaces']);
    expect(rule.non_guarantees).toEqual(['double-quote "inside"', "single-quote 'inside'"]);
    expect(rule.next_action).toBe('node gitnexus/dist/cli/index.js query --runtime-chain-verify on-demand "Reload NEON.Game.Graph.Nodes.Reloads"',);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

it('rejects rule yaml when topology/closure/claims are missing', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-runtime-claim-rules-'));
  const repoPath = path.join(tempRoot, 'repo');
  const rulesRoot = path.join(repoPath, '.gitnexus', 'rules');
  await fs.mkdir(path.join(rulesRoot, 'approved'), { recursive: true });
  await fs.writeFile(
    path.join(rulesRoot, 'catalog.json'),
    JSON.stringify({
      rules: [
        {
          id: 'demo.reload.rule.v2',
          version: '2.0.0',
          file: 'approved/demo.reload.rule.v2.yaml',
        },
      ],
    }),
    'utf-8',
  );
  await fs.writeFile(
    path.join(rulesRoot, 'approved', 'demo.reload.rule.v2.yaml'),
    [
      'id: demo.reload.rule.v2',
      'version: 2.0.0',
      'trigger_family: reload',
      'resource_types:',
      '  - asset',
      'host_base_type:',
      '  - ReloadBase',
      'required_hops:',
      '  - resource',
      'guarantees:',
      '  - reload_chain_closed',
      'non_guarantees:',
      '  - no_runtime_execution_guarantee',
    ].join('\n'),
    'utf-8',
  );

  try {
    const loadError = await loadRuleRegistry(repoPath).catch(e => e);
    expect(String(loadError.message || '')).toMatch(/topology|closure|claims/i);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

it('loads v2 verification bundle from explicit compiled path without catalog fallback', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-runtime-claim-rules-'));
  const repoPath = path.join(tempRoot, 'repo');
  const compiledRoot = path.join(repoPath, '.gitnexus', 'rules', 'compiled');
  await fs.mkdir(compiledRoot, { recursive: true });
  await fs.writeFile(
    path.join(compiledRoot, 'verification_rules.v2.json'),
    JSON.stringify({
      bundle_version: '2.0.0',
      family: 'verification_rules',
      generated_at: new Date().toISOString(),
      rules: [
        {
          id: 'demo.bundle.rule.v2',
          version: '2.0.0',
          trigger_family: 'reload',
          resource_types: ['asset'],
          host_base_type: ['ReloadBase'],
          required_hops: ['resource', 'code_runtime'],
          guarantees: ['reload_chain_closed'],
          non_guarantees: ['no_runtime_execution'],
          next_action: 'gitnexus query "reload"',
          file_path: '.gitnexus/rules/compiled/verification_rules.v2.json',
          match: { trigger_tokens: ['reload'] },
          topology: [
            { hop: 'resource', from: { entity: 'resource' }, to: { entity: 'script' }, edge: { kind: 'binds_script' } },
          ],
          closure: {
            required_hops: ['resource', 'code_runtime'],
            failure_map: { missing_evidence: 'rule_matched_but_evidence_missing' },
          },
          claims: {
            guarantees: ['reload_chain_closed'],
            non_guarantees: ['no_runtime_execution'],
            next_action: 'gitnexus query "reload"',
          },
        },
      ],
    }, null, 2),
    'utf-8',
  );

  try {
    const registry = await loadRuleRegistry(repoPath);
    expect(registry.activeRules[0].id).toBe('demo.bundle.rule.v2');
    expect(registry.activeRules[0].version).toBe('2.0.0');
    expect(registry.activeRules[0].required_hops).toEqual(['resource', 'code_runtime']);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
