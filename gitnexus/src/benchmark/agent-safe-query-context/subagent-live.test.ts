import { describe, it, expect } from 'vitest'

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildSubagentPrompt, loadSubagentLiveCaseResult, prepareSubagentCaseRun } from './subagent-live.js';
import type { AgentSafeBenchmarkCase } from './types.js';

const fakeCase: AgentSafeBenchmarkCase = {
  label: 'weapon_powerup',
  start_query: 'weapon powerup equip chain',
  retry_query: 'retry',
  proof_contexts: ['HoldPickup', 'EquipWithEvent'],
  proof_cypher:
    "MATCH (src)-[:CodeRelation {type: 'CALLS'}]->(dst) WHERE (src.name = 'HoldPickup' AND dst.name = 'PickItUp') OR (src.name = 'EquipWithEvent' AND dst.name = 'Equip') RETURN src.name, dst.name",
  tool_plan: [{ tool: 'query', input: { query: 'WeaponPowerUp' } }],
  live_task: {
    objective: 'pickup/equip bridge proof',
    symbol_seed: 'WeaponPowerUp',
    resource_seed: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
  },
  semantic_tuple: {
    resource_anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
    symbol_anchor: 'WeaponPowerUp',
    proof_edges: [
      'HoldPickup -> WeaponPowerUp.PickItUp',
      'EquipWithEvent -> WeaponPowerUp.Equip',
    ],
    closure_status: 'not_verified_full',
  },
};

it('buildSubagentPrompt includes wrapper command and final JSON schema without leaking canonical proof edges', () => {
  const prompt = buildSubagentPrompt(fakeCase, {
    repo: 'neonspark-core',
    runDir: '/tmp/run',
    resultPath: '/tmp/run/result.json',
  });

  expect(prompt.includes('telemetry-tool.js')).toBe(true);
  expect(prompt.includes('Final JSON schema:')).toBe(true);
  expect(prompt.includes('strongest supported relation')).toBe(false);
  expect(prompt.includes('pickup/equip bridge proof')).toBe(true);
  expect(prompt.includes('HoldPickup -> WeaponPowerUp.PickItUp')).toBe(false);
  expect(prompt.includes('EquipWithEvent -> WeaponPowerUp.Equip')).toBe(false);
});

it('prepareSubagentCaseRun writes prompt artifact', async () => {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-safe-run-'));
  const prepared = await prepareSubagentCaseRun(runDir, fakeCase, { repo: 'neonspark-core' });

  const prompt = await fs.readFile(prepared.promptPath, 'utf-8');
  expect(prompt.includes('WeaponPowerUp')).toBe(true);
  expect(prompt.includes('telemetry-tool.js')).toBe(true);
});

it('loadSubagentLiveCaseResult validates telemetry rows and derives semantic tuple from tool evidence', async () => {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-safe-run-'));
  const promptPath = path.join(runDir, 'prompt.txt');
  const resultPath = path.join(runDir, 'result.json');
  const telemetryPath = path.join(runDir, 'telemetry.jsonl');

  await fs.writeFile(promptPath, buildSubagentPrompt(fakeCase, {
    repo: 'neonspark-core',
    runDir,
    resultPath,
  }), 'utf-8');
  await fs.writeFile(resultPath, JSON.stringify({
    resource_anchor: fakeCase.semantic_tuple.resource_anchor,
    symbol_anchor: fakeCase.semantic_tuple.symbol_anchor,
    proof_edges: fakeCase.semantic_tuple.proof_edges,
    closure_status: 'not_verified_full',
    summary: 'Found supporting pickup/equip evidence.',
  }, null, 2));
  await fs.writeFile(
    telemetryPath,
    [
      JSON.stringify({
        tool: 'query',
        input: { query: 'WeaponPowerUp', repo: 'neonspark-core' },
        output: {
          candidates: [{ name: 'WeaponPowerUp' }],
          resource_hints: [{ target: fakeCase.semantic_tuple.resource_anchor }],
        },
        durationMs: 12,
        totalTokensEst: 120,
        timestamp: '2026-04-08T00:00:00.000Z',
      }),
      JSON.stringify({
        tool: 'cypher',
        input: { query: fakeCase.proof_cypher, repo: 'neonspark-core' },
        output: {
          markdown: '| src.name | dst.name |\n| --- | --- |\n| HoldPickup | PickItUp |\n| EquipWithEvent | Equip |',
          row_count: 2,
        },
        durationMs: 8,
        totalTokensEst: 80,
        timestamp: '2026-04-08T00:00:01.000Z',
      }),
    ].join('\n'),
    'utf-8',
  );

  const result = await loadSubagentLiveCaseResult(runDir, fakeCase);
  expect(result.normalized_tuple_pass).toBe(true);
  expect(result.evidence_validation_pass).toBe(true);
  expect(result.failure_class).toBe(undefined);
  expect(result.semantic_tuple_pass).toBe(true);
  expect(result.tool_calls_to_completion).toBe(2);
  expect(result.tokens_to_completion).toBe(200);
});

it('loadSubagentLiveCaseResult keeps case non-passing when evidence validation fails', async () => {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-safe-run-'));
  const promptPath = path.join(runDir, 'prompt.txt');
  const resultPath = path.join(runDir, 'result.json');
  const telemetryPath = path.join(runDir, 'telemetry.jsonl');

  await fs.writeFile(promptPath, buildSubagentPrompt(fakeCase, {
    repo: 'neonspark-core',
    runDir,
    resultPath,
  }), 'utf-8');
  await fs.writeFile(resultPath, JSON.stringify({
    resource_anchor: fakeCase.semantic_tuple.resource_anchor,
    symbol_anchor: 'Game.Runtime.WeaponPowerUp',
    proof_edges: [
      { caller: 'HoldPickup', callee: 'WeaponPowerUp.PickItUp' },
      { caller: 'EquipWithEvent', callee: 'WeaponPowerUp.Equip' },
    ],
    closure_status: 'not_verified_full',
    summary: 'Normalized tuple inferred from final response.',
  }, null, 2));
  await fs.writeFile(
    telemetryPath,
    JSON.stringify({
      tool: 'query',
      input: { query: 'WeaponPowerUp', repo: 'neonspark-core' },
      output: {
        candidates: [{ name: 'WeaponPowerUp' }],
        resource_hints: [{ target: fakeCase.semantic_tuple.resource_anchor }],
      },
      durationMs: 12,
      totalTokensEst: 120,
      timestamp: '2026-04-08T00:00:00.000Z',
    }),
    'utf-8',
  );

  const result = await loadSubagentLiveCaseResult(runDir, fakeCase);
  expect(result.normalized_tuple_pass).toBe(true);
  expect(result.evidence_validation_pass).toBe(false);
  expect(result.semantic_tuple_pass).toBe(false);
  expect(result.failure_class).toBe('evidence_missing');
});

it('loadSubagentLiveCaseResult rejects non-allowlisted tools', async () => {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-safe-run-'));
  const promptPath = path.join(runDir, 'prompt.txt');
  const resultPath = path.join(runDir, 'result.json');
  const telemetryPath = path.join(runDir, 'telemetry.jsonl');

  await fs.writeFile(promptPath, buildSubagentPrompt(fakeCase, {
    repo: 'neonspark-core',
    runDir,
    resultPath,
  }), 'utf-8');
  await fs.writeFile(resultPath, JSON.stringify({ summary: 'noop' }), 'utf-8');
  await fs.writeFile(
    telemetryPath,
    JSON.stringify({
      tool: 'impact',
      input: {},
      output: {},
      durationMs: 1,
      totalTokensEst: 1,
      timestamp: '2026-04-08T00:00:00.000Z',
    }),
    'utf-8',
  );

  await expect(() => loadSubagentLiveCaseResult(runDir, fakeCase)).rejects.toThrow(/non-allowlisted tool/);
});
