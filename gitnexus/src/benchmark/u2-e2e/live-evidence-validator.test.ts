import { describe, it, expect } from 'vitest'

import { validateLiveEvidenceRows } from './live-evidence-validator.js';

it('validateLiveEvidenceRows fails when required authenticity fields are missing', () => {
  const result = validateLiveEvidenceRows([
    {
      timestamp: '2026-04-01T10:00:00.000Z',
      command: 'node gitnexus/dist/cli/index.js query -r neonspark-core "Reload"',
      flags: { confidenceFields: 'on' },
      request_excerpt: 'Reload NEON.Game.Graph.Nodes.Reloads',
      response_excerpt: 'processes: []',
      segment: 'resource',
      // hop_anchor intentionally missing
    } as any,
  ]);

  expect(result.valid).toBe(false);
  expect(result.errors.some((row) => /hop_anchor/i.test(row))).toBeTruthy();
});

it('validateLiveEvidenceRows passes when authenticity schema is complete', () => {
  const result = validateLiveEvidenceRows([
    {
      timestamp: '2026-04-01T10:00:00.000Z',
      command: 'node gitnexus/dist/cli/index.js query -r neonspark-core "Reload"',
      flags: { confidenceFields: 'on', unity_resources: 'on', unity_hydration: 'parity' },
      request_excerpt: 'Reload NEON.Game.Graph.Nodes.Reloads',
      response_excerpt: 'confidence=low verification_hint.action=rerun_parity_hydration',
      segment: 'runtime',
      hop_anchor: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs:CheckReload',
    },
  ]);

  expect(result.valid).toBe(true);
  expect(result.errors.length).toBe(0);
});
