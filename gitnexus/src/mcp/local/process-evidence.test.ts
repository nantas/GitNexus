import { describe, it, expect } from 'vitest';

import { deriveEvidenceFingerprint, mergeProcessEvidence } from './process-evidence.js';

it('projected-only rows are method_projected + medium', () => {
  const out = mergeProcessEvidence({
    directRows: [],
    projectedRows: [
      {
        pid: 'proc:login',
        label: 'User Login',
        step: 2,
        stepCount: 4,
        viaMethodId: 'method:AuthService.authenticate',
      },
    ],
  });

  expect(out[0].evidence_mode).toBe('method_projected');
  expect(out[0].confidence).toBe('medium');
});

it('direct rows dominate projected rows for same process id', () => {
  const out = mergeProcessEvidence({
    directRows: [{ pid: 'proc:login', label: 'User Login', step: 1, stepCount: 4 }],
    projectedRows: [
      {
        pid: 'proc:login',
        label: 'User Login',
        step: 2,
        stepCount: 4,
        viaMethodId: 'method:AuthService.authenticate',
      },
    ],
  });

  expect(out[0].evidence_mode).toBe('direct_step');
  expect(out[0].confidence).toBe('high');
});

it('mergeProcessEvidence never emits resource_heuristic rows', () => {
  const out = mergeProcessEvidence({
    directRows: [],
    projectedRows: [],
  });

  expect(out.some((row) => String((row as any).evidence_mode) === 'resource_heuristic')).toBe(false);
});

it('deriveEvidenceFingerprint is stable for same input ordering', () => {
  const left = deriveEvidenceFingerprint(
    { resourcePath: 'Assets/A.prefab', bindingKind: 'component', line: 10 },
    { pid: 'proc:123', step: 1 },
  );
  const right = deriveEvidenceFingerprint(
    { line: 10, bindingKind: 'component', resourcePath: 'Assets/A.prefab' },
    { step: 1, pid: 'proc:123' },
  );

  expect(left).toBe(right);
});

it('deriveEvidenceFingerprint changes when signal changes', () => {
  const left = deriveEvidenceFingerprint({ resourcePath: 'Assets/A.prefab', line: 10 });
  const right = deriveEvidenceFingerprint({ resourcePath: 'Assets/A.prefab', line: 11 });

  expect(left).not.toBe(right);
});
