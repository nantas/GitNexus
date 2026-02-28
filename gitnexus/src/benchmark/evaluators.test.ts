import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFailureTriage } from './evaluators.js';

test('buildFailureTriage groups repeated failure classes', () => {
  const triage = buildFailureTriage([
    { kind: 'ambiguous-name-wrong-hit' },
    { kind: 'ambiguous-name-wrong-hit' },
    { kind: 'impact-downstream-zero' },
  ]);
  assert.equal(triage[0].kind, 'ambiguous-name-wrong-hit');
  assert.equal(triage[0].count, 2);
});
