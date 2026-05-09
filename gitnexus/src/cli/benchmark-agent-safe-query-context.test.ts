import { describe, it, expect } from 'vitest'

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { benchmarkAgentSafeQueryContextCommand } from './benchmark-agent-safe-query-context.js';

it('benchmark-agent-safe-query-context runs suite loader, benchmark, and report writer', async () => {
  const output: string[] = [];
  const calls: Array<{ repo?: string }> = [];

  const report = await benchmarkAgentSafeQueryContextCommand('../benchmarks/agent-safe-query-context/neonspark-v1', {
    repo: 'neonspark-core',
    reportDir: '.gitnexus/benchmark-agent-safe-query-context-test',
    subagentRunsDir: '.gitnexus/subagent-runs',
    skipAnalyze: true,
  }, {
    loadSuite: async () => ({
      thresholds: {
        workflowReplay: { maxSteps: 5 },
        tokenReduction: { weapon_powerup: 0.5, reload: 0.4 },
      },
      cases: {
        weapon_powerup: {
          label: 'weapon_powerup',
          start_query: 'weapon powerup equip chain',
          retry_query: 'retry',
          proof_contexts: ['WeaponPowerUp'],
          proof_cypher: 'MATCH () RETURN 1',
          tool_plan: [],
          live_task: {
            objective: 'Investigate WeaponPowerUp from the provided asset seed.',
            symbol_seed: 'WeaponPowerUp',
            resource_seed: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
          },
          semantic_tuple: {
            resource_anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
            symbol_anchor: 'WeaponPowerUp',
            proof_edges: ['HoldPickup -> WeaponPowerUp.PickItUp'],
            closure_status: 'not_verified_full',
          },
        },
        reload: {
          label: 'reload',
          start_query: 'reload getvalue checkreload',
          retry_query: 'retry',
          proof_contexts: ['ReloadBase'],
          proof_cypher: 'MATCH () RETURN 1',
          tool_plan: [],
          live_task: {
            objective: 'Investigate ReloadBase from the provided graph seed.',
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
    }),
    runBenchmark: async (_suite, options) => {
      calls.push({ repo: options.repo });
      const workflowReplayCases = {
        weapon_powerup: {
          steps: [],
          semantic_tuple: {
            resource_anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
            symbol_anchor: 'WeaponPowerUp',
            proof_edges: ['HoldPickup -> WeaponPowerUp.PickItUp'],
            closure_status: 'not_verified_full' as const,
          },
          normalized_tuple_pass: true,
          evidence_validation_pass: true,
          failure_class: undefined,
          semantic_tuple_pass: true,
          anchor_top1_pass: true,
          recommended_follow_up_hit: true,
          post_narrowing_anchor_pass: true,
          post_narrowing_follow_up_hit: true,
          guid_invariance_pass: true,
          base: {
            primary_candidate: 'WeaponPowerUp',
            recommended_follow_up: 'resource_path_prefix=Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
          },
          guid_variant: {
            primary_candidate: 'WeaponPowerUp',
            recommended_follow_up: 'resource_path_prefix=Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
          },
          confirmed_chain: { steps: ['HoldPickup -> PickItUp'] },
          live_tool_evidence_pass: true,
          freeze_ready: true,
          tier_envelope: {
            facts_present: true,
            closure_present: true,
            clues_present: true,
            semantic_order_pass: true,
            summary_source: 'facts',
          },
          ambiguity_detour_count: 0,
          placeholder_leak_detected: false,
          heuristic_top_summary_detected: false,
          tool_calls_to_completion: 1,
          tokens_to_completion: 1,
          retry_breakdown: { query_retry_count: 0, context_retry_count: 0, cypher_retry_count: 0 },
          stop_reason: 'semantic_tuple_satisfied' as const,
        },
        reload: {
          steps: [],
          semantic_tuple: {
            resource_anchor: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
            symbol_anchor: 'ReloadBase',
            proof_edge: 'ReloadBase.GetValue -> ReloadBase.CheckReload',
            closure_status: 'not_verified_full' as const,
          },
          normalized_tuple_pass: true,
          evidence_validation_pass: true,
          failure_class: undefined,
          semantic_tuple_pass: true,
          anchor_top1_pass: true,
          recommended_follow_up_hit: true,
          post_narrowing_anchor_pass: true,
          post_narrowing_follow_up_hit: true,
          guid_invariance_pass: true,
          base: {
            primary_candidate: 'ReloadBase',
            recommended_follow_up: 'resource_path_prefix=Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
          },
          guid_variant: {
            primary_candidate: 'ReloadBase',
            recommended_follow_up: 'resource_path_prefix=Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
          },
          confirmed_chain: { steps: ['GetValue -> CheckReload'] },
          live_tool_evidence_pass: true,
          freeze_ready: true,
          tier_envelope: {
            facts_present: true,
            closure_present: true,
            clues_present: true,
            semantic_order_pass: true,
            summary_source: 'facts',
          },
          ambiguity_detour_count: 0,
          placeholder_leak_detected: false,
          heuristic_top_summary_detected: false,
          tool_calls_to_completion: 1,
          tokens_to_completion: 1,
          retry_breakdown: { query_retry_count: 0, context_retry_count: 0, cypher_retry_count: 0 },
          stop_reason: 'semantic_tuple_satisfied' as const,
        },
      };
      const sameScriptCases = {
        weapon_powerup: {
          tool_plan: [],
          steps: [],
          semantic_tuple: {
            resource_anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
            symbol_anchor: 'WeaponPowerUp',
            proof_edges: ['HoldPickup -> WeaponPowerUp.PickItUp'],
            closure_status: 'not_verified_full' as const,
          },
          semantic_tuple_pass: true,
          tool_calls_to_completion: 1,
          tokens_to_completion: 1,
        },
        reload: {
          tool_plan: [],
          steps: [],
          semantic_tuple: {
            resource_anchor: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
            symbol_anchor: 'ReloadBase',
            proof_edge: 'ReloadBase.GetValue -> ReloadBase.CheckReload',
            closure_status: 'not_verified_full' as const,
          },
          semantic_tuple_pass: true,
          tool_calls_to_completion: 1,
          tokens_to_completion: 1,
        },
      };
      const subagentLive = {
        weapon_powerup: {
          steps: [],
          semantic_tuple: {
            resource_anchor: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
            symbol_anchor: 'WeaponPowerUp',
            proof_edges: ['HoldPickup -> WeaponPowerUp.PickItUp'],
            closure_status: 'not_verified_full' as const,
          },
          normalized_tuple_pass: true,
          evidence_validation_pass: true,
          failure_class: undefined,
          semantic_tuple_pass: true,
          tool_calls_to_completion: 1,
          tokens_to_completion: 1,
          stop_reason: 'semantic_tuple_satisfied' as const,
          prompt: 'Use only telemetry-tool.js\nFinal JSON schema:',
          prompt_path: '/tmp/prompt.txt',
          result_path: '/tmp/result.json',
          telemetry_path: '/tmp/telemetry.jsonl',
          final_result: {},
        },
        reload: {
          steps: [],
          semantic_tuple: {
            resource_anchor: 'Assets/NEON/Graphs/PlayerGun/Gungraph_use/1_weapon_orb_key.asset',
            symbol_anchor: 'ReloadBase',
            proof_edge: 'ReloadBase.GetValue -> ReloadBase.CheckReload',
            closure_status: 'not_verified_full' as const,
          },
          normalized_tuple_pass: true,
          evidence_validation_pass: true,
          failure_class: undefined,
          semantic_tuple_pass: true,
          tool_calls_to_completion: 1,
          tokens_to_completion: 1,
          stop_reason: 'semantic_tuple_satisfied' as const,
          prompt: 'Use only telemetry-tool.js\nFinal JSON schema:',
          prompt_path: '/tmp/prompt.txt',
          result_path: '/tmp/result.json',
          telemetry_path: '/tmp/telemetry.jsonl',
          final_result: {},
        },
      };
      return {
        generatedAt: '2026-04-08T00:00:00.000Z',
        workflow_replay_full: workflowReplayCases,
        workflow_replay_slim: workflowReplayCases,
        same_script_full: sameScriptCases,
        same_script_slim: sameScriptCases,
        cases: subagentLive,
        same_script: {
          tool_plan: { weapon_powerup: [], reload: [] },
          cases: sameScriptCases,
        },
        subagent_live: subagentLive,
        acceptance: { pass: true, cases: { weapon_powerup: true, reload: true } },
        pass: true,
        semantic_equivalence: { pass: false, cases: { weapon_powerup: false, reload: false } },
        token_summary: {
          weapon_powerup: { before: 1, after: 1, saved: 0, reduction: 0 },
          reload: { before: 1, after: 1, saved: 0, reduction: 0 },
        },
        call_summary: {
          weapon_powerup: { before: 1, after: 1, saved: 0 },
          reload: { before: 1, after: 1, saved: 0 },
        },
      };
    },
    writeReports: async () => {},
    writeLine: (line: string) => output.push(line),
    analyze: async () => ({ stdout: '', stderr: '' }),
  });

  expect(calls[0].repo).toBe('neonspark-core');
  expect(output.some((line) => line.includes('PASS'))).toBeTruthy();
  expect(output.some((line) => line.includes('weapon_powerup: guid_invariance_pass=true, live_tool_evidence_pass=true, freeze_ready'))).toBeTruthy();
  expect(output.some((line) => line.includes('Report:'))).toBeTruthy();
  expect(report.workflow_replay_slim.weapon_powerup.placeholder_leak_detected).toBe(false);
  expect(report.workflow_replay_slim.weapon_powerup.heuristic_top_summary_detected).toBe(false);
});

it('runtime retrieval contract docs remove heuristic mode and pin full as debug-only', async () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const docPaths = [
    'gitnexus/src/mcp/tools.ts',
  ].map((relativePath) => path.join(repoRoot, relativePath));

  const text = (await Promise.all(docPaths.map((filePath) => fs.readFile(filePath, 'utf-8')))).join('\n');

  expect(text.includes('discovery -> seed narrowing -> closure verification')).toBeTruthy();
  expect(!text.includes('resource_heuristic')).toBeTruthy();
  expect(text.includes('response_profile=slim is the default and sufficient')).toBeTruthy();
  expect(text.includes('response_profile=full is for debugging')).toBeTruthy();
  expect(text.includes('strong graph hops can coexist with failed closure')).toBeTruthy();
});
