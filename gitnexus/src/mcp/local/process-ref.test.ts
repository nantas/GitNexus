import { describe, it, expect } from 'vitest';

import { buildDerivedProcessId } from './process-ref.js';

it('buildDerivedProcessId is stable for identical fingerprint input', () => {
  const left = buildDerivedProcessId({
    indexedCommit: 'abc',
    symbolUid: 'Class:Assets/A.cs:A',
    evidenceFingerprint: 'resource=Assets/A.prefab;line=10',
  });
  const right = buildDerivedProcessId({
    indexedCommit: 'abc',
    symbolUid: 'Class:Assets/A.cs:A',
    evidenceFingerprint: 'resource=Assets/A.prefab;line=10',
  });
  expect(left).toBe(right);
});

it('buildDerivedProcessId does not leak heuristic process id prefix', () => {
  const id = buildDerivedProcessId({
    indexedCommit: 'abc',
    symbolUid: 'Class:Assets/A.cs:A',
    evidenceFingerprint: 'resource=Assets/A.prefab;line=11',
  });
  expect(id).not.toMatch(/^proc:heuristic:/);
});
