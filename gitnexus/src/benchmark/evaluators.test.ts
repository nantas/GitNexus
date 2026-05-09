import { describe, it, expect } from 'vitest'

import { buildFailureTriage } from './evaluators.js';

it('buildFailureTriage groups repeated failure classes', () => {
  const triage = buildFailureTriage([
    { kind: 'ambiguous-name-wrong-hit' },
    { kind: 'ambiguous-name-wrong-hit' },
    { kind: 'impact-downstream-zero' },
  ]);
  expect(triage[0].kind).toBe('ambiguous-name-wrong-hit');
  expect(triage[0].count).toBe(2);
});
