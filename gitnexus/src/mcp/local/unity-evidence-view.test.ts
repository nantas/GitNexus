import { describe, it, expect } from 'vitest';

import { buildUnityEvidenceView } from './unity-evidence-view.js';

it('unity evidence view emits truncation metadata and fetch hint', () => {
  const out = buildUnityEvidenceView({
    resourceBindings: [
      {
        resourcePath: 'Assets/A.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '1',
        evidence: { line: 1, lineText: 'x' },
        serializedFields: {
          scalarFields: [],
          referenceFields: [
            { name: 'r1', sourceLayer: 'base' },
            { name: 'r2', sourceLayer: 'base' },
          ],
        },
        resolvedReferences: [],
      },
      {
        resourcePath: 'Assets/B.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '2',
        evidence: { line: 2, lineText: 'y' },
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
      },
    ],
    mode: 'summary',
    maxBindings: 1,
    maxReferenceFields: 1,
  } as any);

  expect(out.evidence_meta.truncated).toBe(true);
  expect(out.evidence_meta.omitted_count > 0).toBeTruthy();
  expect(out.evidence_meta.next_fetch_hint || '').toMatch(/unity_evidence_mode=full/i);
  expect(out.serializedFields).toBe(undefined);
});

it('unity evidence view keeps serialized fields in full mode', () => {
  const out = buildUnityEvidenceView({
    resourceBindings: [
      {
        resourcePath: 'Assets/A.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '1',
        evidence: { line: 1, lineText: 'x' },
        serializedFields: {
          scalarFields: [{ name: 'scalarA', sourceLayer: 'base' }],
          referenceFields: [{ name: 'refA', sourceLayer: 'base' }],
        },
        resolvedReferences: [],
      },
    ],
    mode: 'full',
  } as any);

  expect(out.serializedFields?.scalarFields.length).toBe(1);
  expect(out.serializedFields?.referenceFields.length).toBe(1);
});
