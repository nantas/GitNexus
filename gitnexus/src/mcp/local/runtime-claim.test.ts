
import { describe, it, expect } from 'vitest';
import { buildRuntimeClaimFromRule } from './runtime-claim.js';

it('runtime_claim contract includes rule-driven metadata and guarantees', () => {
  const claim = buildRuntimeClaimFromRule({
    rule: {
      id: 'demo.reload.v1',
      version: '1.2.3',
      trigger_family: 'reload',
      resource_types: ['asset'],
      host_base_type: ['ReloadBase'],
      required_hops: ['resource'],
      guarantees: ['demo_chain_closed'],
      non_guarantees: ['demo_non_guarantee'],
      next_action: 'node demo',
      file_path: '.gitnexus/rules/approved/demo.reload.v1.yaml',
    },
    status: 'verified_full',
    evidence_level: 'verified_chain',
    hops: [{ hop_type: 'resource', anchor: 'Assets/A.prefab:1', confidence: 'high', note: 'resource anchor' }],
    gaps: [],
  });

  expect(claim.rule_id).toBe('demo.reload.v1');
  expect(claim.rule_version).toBe('1.2.3');
  expect(claim.guarantees).toEqual(['demo_chain_closed']);
  expect(claim.non_guarantees).toEqual(['demo_non_guarantee']);
});
