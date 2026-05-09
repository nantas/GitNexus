import { describe, it, expect } from 'vitest'

import { runAgentSafeQueryContextBenchmark } from './report.js';
import type { AgentSafeBenchmarkSuite } from './types.js';

const fakeSuite: AgentSafeBenchmarkSuite = {
  thresholds: {
    workflowReplay: { maxSteps: 5 },
    tokenReduction: {
      weapon_powerup: 0.5,
      reload: 0.4,
    },
  },
  cases: {
    weapon_powerup: {
      label: 'weapon_powerup',
      start_query: 'weapon powerup equip chain',
      retry_query: '1_weapon_orb_key.asset WeaponPowerUp HoldPickup EquipWithEvent Equip',
      proof_contexts: ['WeaponPowerUp'],
      proof_cypher: 'MATCH () RETURN 1',
      tool_plan: [{ tool: 'query', input: { query: 'weapon powerup equip chain' } }],
      live_task: {
        objective: 'Investigate WeaponPowerUp from the provided asset seed and report the best supported runtime relation.',
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
    },
    reload: {
      label: 'reload',
      start_query: 'reload getvalue checkreload',
      retry_query: 'Gungraph_use/1_weapon_orb_key.asset ReloadBase GetValue CheckReload',
      proof_contexts: ['ReloadBase'],
      proof_cypher: 'MATCH () RETURN 1',
      tool_plan: [{ tool: 'query', input: { query: 'reload getvalue checkreload' } }],
      live_task: {
        objective: 'Investigate ReloadBase from the provided graph asset seed and report the best supported reload relation.',
        symbol_seed: 'ReloadBase',
        resource_seed: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
      },
      semantic_tuple: {
        resource_anchor: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
        symbol_anchor: 'ReloadBase',
        proof_edge: 'ReloadBase.GetValue -> ReloadBase.CheckReload',
        closure_status: 'not_verified_full',
      },
    },
  },
};

it('benchmark report includes explicit benchmark tracks', async () => {
  const report = await runAgentSafeQueryContextBenchmark(fakeSuite, {
    repo: 'neonspark-core',
    subagentRunsDir: '/tmp/subagent-runs',
  }, {
    runner: {
      query: async (input) => {
        const queryText = String(input?.query || '');
        if (/reload|ReloadBase|CheckReload/.test(queryText)) {
          return {
            candidates: [{ name: 'ReloadBase' }],
            resource_hints: [{ path: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset' }],
          };
        }
        return {
          candidates: [{ name: 'WeaponPowerUp' }],
          resource_hints: [{ path: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
        };
      },
      context: async (input) => ({ symbol: { name: String(input?.name || 'WeaponPowerUp') } }),
      impact: async () => ({ impactedCount: 0 }),
      cypher: async (input) => {
        const queryText = String(input?.query || '');
        if (queryText.includes('CheckReload') || queryText.includes('GetValue')) {
          return { row_count: 1, rows: [{ src: 'GetValue', dst: 'CheckReload' }] };
        }
        return {
          row_count: 2,
          rows: [
            { src: 'HoldPickup', dst: 'PickItUp' },
            { src: 'EquipWithEvent', dst: 'Equip' },
          ],
        };
      },
      close: async () => {},
    },
    executeToolPlan: async (plan) =>
      plan.map((step) => ({
        tool: step.tool,
        input: step.input,
        output: {
          anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
          symbol: 'WeaponPowerUp',
          proof: 'HoldPickup -> WeaponPowerUp.PickItUp',
        },
      })),
    loadSubagentLiveCaseResult: async (_runDir, benchmarkCase) => ({
      prompt: 'Use only telemetry-tool.js\nFinal JSON schema:',
      prompt_path: '/tmp/prompt.txt',
      result_path: '/tmp/result.json',
      telemetry_path: '/tmp/telemetry.jsonl',
      final_result: {},
      steps: [{
        tool: 'query',
        input: { query: benchmarkCase.start_query },
        output: { value: benchmarkCase.semantic_tuple.resource_anchor },
        durationMs: 1,
        totalTokensEst: 10,
        timestamp: '2026-04-08T00:00:00.000Z',
      }],
      semantic_tuple: benchmarkCase.semantic_tuple,
      normalized_tuple_pass: true,
      evidence_validation_pass: true,
      failure_class: undefined,
      semantic_tuple_pass: true,
      tool_calls_to_completion: 1,
      tokens_to_completion: 10,
      stop_reason: 'semantic_tuple_satisfied' as const,
    }),
  });

  expect(report.cases.weapon_powerup.semantic_tuple_pass).toBe(true);
  expect(report.same_script.tool_plan.weapon_powerup).toBeTruthy();
  expect(report.subagent_live.reload.steps).toBeTruthy();
  expect(report.token_summary.weapon_powerup).toBeTruthy();
  expect(report.call_summary.reload).toBeTruthy();
  expect(report.workflow_replay_full.weapon_powerup).toBeTruthy();
  expect(report.workflow_replay_slim.weapon_powerup).toBeTruthy();
  expect(report.same_script_full.reload).toBeTruthy();
  expect(report.same_script_slim.reload).toBeTruthy();
  expect(report.subagent_live.weapon_powerup).toBeTruthy();
  expect(report.workflow_replay_slim.weapon_powerup.semantic_tuple_pass).toBe(true);
  expect(typeof report.workflow_replay_slim.weapon_powerup.anchor_top1_pass).toBe('boolean');
  expect(typeof report.workflow_replay_slim.weapon_powerup.recommended_follow_up_hit).toBe('boolean');
  expect(typeof report.workflow_replay_slim.weapon_powerup.post_narrowing_anchor_pass).toBe('boolean');
  expect(typeof report.workflow_replay_slim.weapon_powerup.post_narrowing_follow_up_hit).toBe('boolean');
  expect(typeof report.workflow_replay_slim.weapon_powerup.ambiguity_detour_count).toBe('number');
  expect(report.workflow_replay_slim.reload.guid_invariance_pass).toBe(true);
  expect(report.workflow_replay_slim.weapon_powerup.live_tool_evidence_pass).toBe(true);
  expect(report.acceptance.pass).toBe(report.workflow_replay_slim.weapon_powerup.semantic_tuple_pass
      && report.workflow_replay_slim.weapon_powerup.post_narrowing_anchor_pass
      && report.workflow_replay_slim.weapon_powerup.post_narrowing_follow_up_hit
      && report.workflow_replay_slim.weapon_powerup.guid_invariance_pass
      && report.workflow_replay_slim.weapon_powerup.live_tool_evidence_pass
      && report.workflow_replay_slim.weapon_powerup.freeze_ready
      && report.workflow_replay_slim.weapon_powerup.tier_envelope.facts_present
      && report.workflow_replay_slim.weapon_powerup.tier_envelope.closure_present
      && report.workflow_replay_slim.weapon_powerup.tier_envelope.clues_present
      && report.workflow_replay_slim.weapon_powerup.tier_envelope.semantic_order_pass
      && !report.workflow_replay_slim.weapon_powerup.placeholder_leak_detected
      && !report.workflow_replay_slim.weapon_powerup.heuristic_top_summary_detected
      && report.workflow_replay_slim.reload.semantic_tuple_pass
      && report.workflow_replay_slim.reload.post_narrowing_anchor_pass
      && report.workflow_replay_slim.reload.post_narrowing_follow_up_hit
      && report.workflow_replay_slim.reload.guid_invariance_pass
      && report.workflow_replay_slim.reload.live_tool_evidence_pass
      && report.workflow_replay_slim.reload.freeze_ready
      && report.workflow_replay_slim.reload.tier_envelope.facts_present
      && report.workflow_replay_slim.reload.tier_envelope.closure_present
      && report.workflow_replay_slim.reload.tier_envelope.clues_present
      && report.workflow_replay_slim.reload.tier_envelope.semantic_order_pass
      && !report.workflow_replay_slim.reload.placeholder_leak_detected
      && !report.workflow_replay_slim.reload.heuristic_top_summary_detected,);
  expect(report.pass).toBe(report.acceptance.pass);
});

it('benchmark report enforces track split, acceptance source, prompt secrecy, and live scoring taxonomy', async () => {
  const report = await runAgentSafeQueryContextBenchmark(fakeSuite, {
    repo: 'neonspark-core',
    subagentRunsDir: '/tmp/subagent-runs',
  }, {
    runner: {
      query: async (input) => {
        const queryText = String(input?.query || '');
        if (/reload|ReloadBase|CheckReload/.test(queryText)) {
          return {
            candidates: [{ name: 'ReloadBase' }],
            resource_hints: [{ path: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset' }],
          };
        }
        return {
          candidates: [{ name: 'WeaponPowerUp' }],
          resource_hints: [{ path: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
        };
      },
      context: async (input) => ({ symbol: { name: String(input?.name || 'WeaponPowerUp') } }),
      impact: async () => ({ impactedCount: 0 }),
      cypher: async (input) => {
        const queryText = String(input?.query || '');
        if (queryText.includes('CheckReload') || queryText.includes('GetValue')) {
          return { row_count: 1, rows: [{ src: 'GetValue', dst: 'CheckReload' }] };
        }
        return {
          row_count: 2,
          rows: [
            { src: 'HoldPickup', dst: 'PickItUp' },
            { src: 'EquipWithEvent', dst: 'Equip' },
          ],
        };
      },
      close: async () => {},
    },
    executeToolPlan: async (plan) =>
      plan.map((step) => ({
        tool: step.tool,
        input: step.input,
        output: {
          anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
          symbol: 'WeaponPowerUp',
          proof: 'HoldPickup -> WeaponPowerUp.PickItUp',
        },
      })),
    loadSubagentLiveCaseResult: async (_runDir, benchmarkCase) => ({
      prompt: 'Use only telemetry-tool.js\nFinal JSON schema:',
      prompt_path: '/tmp/prompt.txt',
      result_path: '/tmp/result.json',
      telemetry_path: '/tmp/telemetry.jsonl',
      final_result: {},
      steps: [{
        tool: 'query',
        input: { query: benchmarkCase.start_query },
        output: { value: benchmarkCase.semantic_tuple.resource_anchor },
        durationMs: 1,
        totalTokensEst: 10,
        timestamp: '2026-04-08T00:00:00.000Z',
      }],
      semantic_tuple: benchmarkCase.semantic_tuple,
      normalized_tuple_pass: true,
      evidence_validation_pass: true,
      failure_class: undefined,
      semantic_tuple_pass: true,
      tool_calls_to_completion: 1,
      tokens_to_completion: 10,
      stop_reason: 'semantic_tuple_satisfied' as const,
    }),
  });

  expect(Object.keys(report.workflow_replay_full).length > 0).toBe(true);
  expect(Object.keys(report.workflow_replay_slim).length > 0).toBe(true);
  expect(Object.keys(report.same_script_full).length > 0).toBe(true);
  expect(Object.keys(report.same_script_slim).length > 0).toBe(true);
  expect(Object.keys(report.subagent_live).length > 0).toBe(true);

  expect(report.acceptance.cases).toEqual({
    weapon_powerup:
      report.workflow_replay_slim.weapon_powerup.semantic_tuple_pass
      && report.workflow_replay_slim.weapon_powerup.post_narrowing_anchor_pass
      && report.workflow_replay_slim.weapon_powerup.post_narrowing_follow_up_hit
      && report.workflow_replay_slim.weapon_powerup.guid_invariance_pass
      && report.workflow_replay_slim.weapon_powerup.live_tool_evidence_pass
      && report.workflow_replay_slim.weapon_powerup.freeze_ready
      && report.workflow_replay_slim.weapon_powerup.tier_envelope.facts_present
      && report.workflow_replay_slim.weapon_powerup.tier_envelope.closure_present
      && report.workflow_replay_slim.weapon_powerup.tier_envelope.clues_present
      && report.workflow_replay_slim.weapon_powerup.tier_envelope.semantic_order_pass
      && !report.workflow_replay_slim.weapon_powerup.placeholder_leak_detected
      && !report.workflow_replay_slim.weapon_powerup.heuristic_top_summary_detected,
    reload:
      report.workflow_replay_slim.reload.semantic_tuple_pass
      && report.workflow_replay_slim.reload.post_narrowing_anchor_pass
      && report.workflow_replay_slim.reload.post_narrowing_follow_up_hit
      && report.workflow_replay_slim.reload.guid_invariance_pass
      && report.workflow_replay_slim.reload.live_tool_evidence_pass
      && report.workflow_replay_slim.reload.freeze_ready
      && report.workflow_replay_slim.reload.tier_envelope.facts_present
      && report.workflow_replay_slim.reload.tier_envelope.closure_present
      && report.workflow_replay_slim.reload.tier_envelope.clues_present
      && report.workflow_replay_slim.reload.tier_envelope.semantic_order_pass
      && !report.workflow_replay_slim.reload.placeholder_leak_detected
      && !report.workflow_replay_slim.reload.heuristic_top_summary_detected,
  });

  expect(report.subagent_live.weapon_powerup.prompt.includes('HoldPickup -> WeaponPowerUp.PickItUp')).toBe(false);
  expect(report.subagent_live.reload.prompt.includes('ReloadBase.GetValue -> ReloadBase.CheckReload')).toBe(false);

  for (const row of Object.values(report.subagent_live)) {
    expect(typeof row.normalized_tuple_pass).toBe('boolean');
    expect(typeof row.evidence_validation_pass).toBe('boolean');
    if (!row.semantic_tuple_pass) {
      expect(row.failure_class).toBeTruthy();
    }
  }
});

it('acceptance fails when semantic tuple passes but placeholder leakage is detected', async () => {
  const report = await runAgentSafeQueryContextBenchmark(fakeSuite, {
    repo: 'neonspark-core',
    subagentRunsDir: '/tmp/subagent-runs',
  }, {
    runner: {
      query: async (input) => {
        const queryText = String(input?.query || '');
        if (/reload|ReloadBase|CheckReload/.test(queryText)) {
          return {
            summary: 'ReloadBase flow',
            decision: {
              primary_candidate: 'ReloadBase',
              recommended_follow_up: 'resource_path_prefix=Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
            },
            candidates: [{ name: 'ReloadBase' }],
            resource_hints: [{ target: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset' }],
          };
        }
        return {
          summary: 'WeaponPowerUp flow',
          decision: {
            primary_candidate: 'WeaponPowerUp',
            recommended_follow_up: 'resource_path_prefix=Reload NEON.Game.Graph.Nodes.Reloads',
          },
          candidates: [{ name: 'WeaponPowerUp' }],
          resource_hints: [{ target: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset' }],
        };
      },
      context: async (input) => ({ symbol: { name: String(input?.name || 'WeaponPowerUp') } }),
      impact: async () => ({ impactedCount: 0 }),
      cypher: async (input) => {
        const queryText = String(input?.query || '');
        if (queryText.includes('CheckReload') || queryText.includes('GetValue')) {
          return { row_count: 1, rows: [{ src: 'GetValue', dst: 'CheckReload' }] };
        }
        return {
          row_count: 2,
          rows: [
            { src: 'HoldPickup', dst: 'PickItUp' },
            { src: 'EquipWithEvent', dst: 'Equip' },
          ],
        };
      },
      close: async () => {},
    },
    executeToolPlan: async (plan) =>
      plan.map((step) => ({
        tool: step.tool,
        input: step.input,
        output: {
          anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
          symbol: 'WeaponPowerUp',
          proof: 'HoldPickup -> WeaponPowerUp.PickItUp',
        },
      })),
    loadSubagentLiveCaseResult: async (_runDir, benchmarkCase) => ({
      prompt: 'Use only telemetry-tool.js\nFinal JSON schema:',
      prompt_path: '/tmp/prompt.txt',
      result_path: '/tmp/result.json',
      telemetry_path: '/tmp/telemetry.jsonl',
      final_result: {},
      steps: [{
        tool: 'query',
        input: { query: benchmarkCase.start_query },
        output: { value: benchmarkCase.semantic_tuple.resource_anchor },
        durationMs: 1,
        totalTokensEst: 10,
        timestamp: '2026-04-08T00:00:00.000Z',
      }],
      semantic_tuple: benchmarkCase.semantic_tuple,
      normalized_tuple_pass: true,
      evidence_validation_pass: true,
      failure_class: undefined,
      semantic_tuple_pass: true,
      tool_calls_to_completion: 1,
      tokens_to_completion: 10,
      stop_reason: 'semantic_tuple_satisfied' as const,
    }),
  });

  expect(report.workflow_replay_slim.weapon_powerup.semantic_tuple_pass).toBe(true);
  expect(report.workflow_replay_slim.weapon_powerup.placeholder_leak_detected).toBe(true);
  expect(report.acceptance.cases.weapon_powerup).toBe(false);
  expect(report.acceptance.pass).toBe(false);
});
