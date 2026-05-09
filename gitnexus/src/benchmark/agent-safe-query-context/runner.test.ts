import { describe, it, expect } from 'vitest'

import { runWorkflowReplay } from './runner.js';
import type { AgentSafeBenchmarkCase } from './types.js';

const fakeCase: AgentSafeBenchmarkCase = {
  label: 'weapon_powerup',
  start_query: 'weapon powerup equip chain',
  retry_query: '1_weapon_orb_key.asset WeaponPowerUp HoldPickup EquipWithEvent Equip',
  proof_contexts: ['WeaponPowerUp'],
  proof_cypher:
    "MATCH (src)-[:CodeRelation {type: 'CALLS'}]->(dst) WHERE src.name IN ['HoldPickup', 'EquipWithEvent'] RETURN src.name, dst.name",
  tool_plan: [
    { tool: 'query', input: { query: 'weapon powerup equip chain' } },
    { tool: 'context', input: { name: 'WeaponPowerUp' } },
    { tool: 'cypher', input: { query: "MATCH (src)-[:CodeRelation {type: 'CALLS'}]->(dst) RETURN src.name, dst.name" } },
  ],
  live_task: {
    objective: 'Investigate WeaponPowerUp from the provided asset seed and return the strongest supported pickup/equip runtime relation.',
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

it('workflow replay narrows query only when retry triggers fire', async () => {
  const calls: Array<{ tool: string; input: Record<string, unknown> }> = [];
  let queryCount = 0;

  const fakeRunner = {
    async query(input: Record<string, unknown>) {
      calls.push({ tool: 'query', input });
      queryCount += 1;
      if (queryCount === 1) {
        return {
          candidates: [{ name: 'FallbackCandidate' }],
          resource_hints: [{ path: 'Assets/Other/OffTarget.asset' }],
        };
      }
      return {
        candidates: [{ name: 'WeaponPowerUp' }],
        resource_hints: [
          {
            path: 'Assets/NEON/DataAssets/Powerups/1_newWeapon/0_pick/法器_Orb/1_weapon_orb_key.asset',
          },
        ],
      };
    },
    async context(input: Record<string, unknown>) {
      calls.push({ tool: 'context', input });
      return {
        symbol: { name: 'WeaponPowerUp' },
        incoming: {
          CALLS: [{ name: 'HoldPickup' }, { name: 'EquipWithEvent' }],
        },
        outgoing: {
          CALLS: [{ name: 'PickItUp' }, { name: 'Equip' }],
        },
      };
    },
    async cypher(input: Record<string, unknown>) {
      calls.push({ tool: 'cypher', input });
      return {
        row_count: 2,
        rows: [
          { src: 'HoldPickup', dst: 'PickItUp' },
          { src: 'EquipWithEvent', dst: 'Equip' },
        ],
      };
    },
  };

  const result = await runWorkflowReplay(fakeCase, fakeRunner);
  expect(result.tool_calls_to_completion).toBe(4);
  expect(result.retry_breakdown.query_retry_count).toBe(1);
  expect(result.retry_breakdown.context_retry_count).toBe(0);
  expect(result.semantic_tuple_pass).toBe(true);
  expect(result.stop_reason).toBe('semantic_tuple_satisfied');
  expect(calls.map((entry) => entry.tool).join(',')).toBe('query,query,context,cypher');
});

it('workflow replay applies response_profile to query and context calls', async () => {
  const calls: Array<{ tool: string; input: Record<string, unknown> }> = [];

  const fakeRunner = {
    async query(input: Record<string, unknown>) {
      calls.push({ tool: 'query', input });
      return {
        candidates: [{ name: 'WeaponPowerUp' }],
        resource_hints: [{ path: fakeCase.semantic_tuple.resource_anchor }],
      };
    },
    async context(input: Record<string, unknown>) {
      calls.push({ tool: 'context', input });
      return {
        symbol: { name: 'WeaponPowerUp' },
        incoming: {
          CALLS: [{ name: 'HoldPickup' }, { name: 'EquipWithEvent' }],
        },
        outgoing: {
          CALLS: [{ name: 'PickItUp' }, { name: 'Equip' }],
        },
      };
    },
    async cypher(input: Record<string, unknown>) {
      calls.push({ tool: 'cypher', input });
      return {
        row_count: 2,
        rows: [
          { src: 'HoldPickup', dst: 'PickItUp' },
          { src: 'EquipWithEvent', dst: 'Equip' },
        ],
      };
    },
  };

  const result = await runWorkflowReplay(fakeCase, fakeRunner, { responseProfile: 'slim' });

  const queryCalls = calls.filter((entry) => entry.tool === 'query');
  const contextCalls = calls.filter((entry) => entry.tool === 'context');
  expect(queryCalls.every((entry) => entry.input.response_profile === 'slim')).toBe(true);
  expect(contextCalls.every((entry) => entry.input.response_profile === 'slim')).toBe(true);
  expect(result.guid_invariance_pass).toBe(true);
  expect(result.guid_variant?.primary_candidate).toBe(result.base?.primary_candidate);
  expect(result.guid_variant?.recommended_follow_up).toBe(result.base?.recommended_follow_up);
});

it('workflow replay exposes drift-sensitive metrics from the first-hop output and ambiguity detours', async () => {
  const fakeRunner = {
    async query() {
      return {
        decision: {
          primary_candidate: 'FallbackCandidate',
          recommended_follow_up: 'resource_path_prefix=Assets/Other/OffTarget.asset',
        },
        candidates: [{ name: 'FallbackCandidate' }],
        resource_hints: [{ target: 'Assets/Other/OffTarget.asset' }],
      };
    },
    async context() {
      return {
        status: 'ambiguous',
        candidates: [
          { name: 'WeaponPowerUp', uid: 'Class:A' },
          { name: 'WeaponPowerUp', uid: 'Class:B' },
        ],
      };
    },
    async cypher() {
      return {
        row_count: 2,
        rows: [
          { src: 'HoldPickup', dst: 'PickItUp' },
          { src: 'EquipWithEvent', dst: 'Equip' },
        ],
      };
    },
  };

  const result = await runWorkflowReplay(fakeCase, fakeRunner, { maxSteps: 3, responseProfile: 'slim' });

  expect(result.anchor_top1_pass).toBe(false);
  expect(result.recommended_follow_up_hit).toBe(false);
  expect(result.post_narrowing_anchor_pass).toBe(false);
  expect(result.post_narrowing_follow_up_hit).toBe(false);
  expect(result.ambiguity_detour_count).toBe(1);
});

it('workflow replay tracks post-narrowing convergence separately from first-hop drift', async () => {
  let queryCount = 0;
  const fakeRunner = {
    async query() {
      queryCount += 1;
      if (queryCount === 1) {
        return {
          decision: {
            primary_candidate: 'FallbackCandidate',
            recommended_follow_up: 'resource_path_prefix=Assets/Other/OffTarget.asset',
          },
          candidates: [{ name: 'FallbackCandidate' }],
          resource_hints: [{ target: 'Assets/Other/OffTarget.asset' }],
        };
      }
      return {
        decision: {
          primary_candidate: 'WeaponPowerUp',
          recommended_follow_up: `resource_path_prefix=${fakeCase.semantic_tuple.resource_anchor}`,
        },
        candidates: [{ name: 'WeaponPowerUp' }],
        resource_hints: [{ target: fakeCase.semantic_tuple.resource_anchor }],
      };
    },
    async context() {
      return {
        status: 'ambiguous',
        candidates: [{ name: 'WeaponPowerUp', uid: 'Class:A' }],
      };
    },
    async cypher() {
      return {
        row_count: 2,
        rows: [
          { src: 'HoldPickup', dst: 'PickItUp' },
          { src: 'EquipWithEvent', dst: 'Equip' },
        ],
      };
    },
  };

  const result = await runWorkflowReplay(fakeCase, fakeRunner, { maxSteps: 4, responseProfile: 'slim' });

  expect(result.anchor_top1_pass).toBe(false);
  expect(result.recommended_follow_up_hit).toBe(false);
  expect(result.post_narrowing_anchor_pass).toBe(true);
  expect(result.post_narrowing_follow_up_hit).toBe(true);
});

it('workflow replay flags unrelated placeholder follow-up leakage', async () => {
  const fakeRunner = {
    async query() {
      return {
        decision: {
          primary_candidate: 'WeaponPowerUp',
          recommended_follow_up: 'resource_path_prefix=Reload NEON.Game.Graph.Nodes.Reloads',
        },
        summary: 'WeaponPowerUp flow',
        candidates: [{ name: 'WeaponPowerUp' }],
        resource_hints: [{ target: fakeCase.semantic_tuple.resource_anchor }],
      };
    },
    async context() {
      return {
        symbol: { name: 'WeaponPowerUp' },
      };
    },
    async cypher() {
      return {
        row_count: 2,
        rows: [
          { src: 'HoldPickup', dst: 'PickItUp' },
          { src: 'EquipWithEvent', dst: 'Equip' },
        ],
      };
    },
  };

  const result = await runWorkflowReplay(fakeCase, fakeRunner, { maxSteps: 4, responseProfile: 'slim' });
  expect(result.semantic_tuple_pass).toBe(true);
  expect(result.placeholder_leak_detected).toBe(true);
  expect(result.live_tool_evidence_pass).toBe(true);
  expect(result.freeze_ready).toBe((result.confirmed_chain?.steps.length ?? 0) > 0
      && !result.placeholder_leak_detected
      && Boolean(result.live_tool_evidence_pass)
      && result.guid_invariance_pass,);
  expect((result.confirmed_chain?.steps.length ?? 0) > 0).toBe(false);
});

it('workflow replay surfaces heuristic first-screen drift separately from semantic tuple pass', async () => {
  const fakeRunner = {
    async query() {
      return {
        summary: 'runtime heuristic clue',
        decision: {
          primary_candidate: 'WeaponPowerUp',
          recommended_follow_up: `resource_path_prefix=${fakeCase.semantic_tuple.resource_anchor}`,
        },
        process_hints: [
          {
            summary: 'runtime heuristic clue',
            confidence: 'low',
            evidence_mode: 'resource_heuristic',
          },
          {
            summary: 'Unity-runtime-root -> WeaponPowerUp',
            confidence: 'high',
            evidence_mode: 'direct_step',
          },
        ],
        candidates: [{ name: 'WeaponPowerUp' }],
        resource_hints: [{ target: fakeCase.semantic_tuple.resource_anchor }],
      };
    },
    async context() {
      return {
        symbol: { name: 'WeaponPowerUp' },
      };
    },
    async cypher() {
      return {
        row_count: 2,
        rows: [
          { src: 'HoldPickup', dst: 'PickItUp' },
          { src: 'EquipWithEvent', dst: 'Equip' },
        ],
      };
    },
  };

  const result = await runWorkflowReplay(fakeCase, fakeRunner, { maxSteps: 4, responseProfile: 'slim' });
  expect(result.semantic_tuple_pass).toBe(true);
  expect(result.heuristic_top_summary_detected).toBe(true);
});
