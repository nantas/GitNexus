import { describe, it, expect } from 'vitest';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ResolveOutput, UnityResolvedReference, UnityScalarField } from './resolver.js';
import { resolveUnityBindings } from './resolver.js';
import { buildUnityScanContext } from './scan-context.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity');

const U2_REFERENCE_RESOLUTION_RATE_THRESHOLD = 0.8;
const U2_LIST_REFERENCE_PARSE_RATE_THRESHOLD = 1.0;

function countListCandidatesFromScalarFields(scalarFields: UnityScalarField[]): number {
  let total = 0;
  for (const field of scalarFields) {
    const lines = field.value.split(/\r?\n/);
    for (const line of lines) {
      if (/^\s*-\s*\{[^}]*fileID\s*:/.test(line)) {
        total += 1;
      }
    }
  }
  return total;
}

function countResolvedSuccesses(references: UnityResolvedReference[]): number {
  return references.filter((ref) => ref.resolution === 'local-object' || ref.resolution === 'external-asset').length;
}

function collectU2ReferenceStats(results: ResolveOutput[]): {
  candidateRefs: number;
  resolvedRefs: number;
  listCandidates: number;
  parsedListRefs: number;
} {
  let candidateRefs = 0;
  let resolvedRefs = 0;
  let listCandidates = 0;
  let parsedListRefs = 0;

  for (const result of results) {
    for (const binding of result.resourceBindings) {
      const listCandidatesForBinding = countListCandidatesFromScalarFields(binding.serializedFields.scalarFields);
      const directCandidatesForBinding = binding.serializedFields.referenceFields.length;
      candidateRefs += directCandidatesForBinding + listCandidatesForBinding;
      listCandidates += listCandidatesForBinding;

      resolvedRefs += countResolvedSuccesses(binding.resolvedReferences);
      parsedListRefs += binding.resolvedReferences.filter((ref) => ref.fromList).length;
    }
  }

  return { candidateRefs, resolvedRefs, listCandidates, parsedListRefs };
}

it('U2 threshold: reference_resolution_rate stays above baseline', async () => {
  const scanContext = await buildUnityScanContext({
    repoRoot: fixtureRoot,
    scopedPaths: [
      'Assets/Scripts/MainUIManager.cs',
      'Assets/Scripts/MainUIManager.cs.meta',
      'Assets/Scene/MainUIManager.unity',
      'Assets/Config/MainUIDocument.asset.meta',
      'Assets/Scripts/MenuScreenCarrier.cs',
      'Assets/Scripts/MenuScreenCarrier.cs.meta',
      'Assets/Prefabs/MenuScreenCarrier.prefab',
    ],
  });

  const [mainUIManager, menuScreenCarrier] = await Promise.all([
    resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'MainUIManager', scanContext }),
    resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'MenuScreenCarrier', scanContext }),
  ]);

  const stats = collectU2ReferenceStats([mainUIManager, menuScreenCarrier]);
  expect(stats.candidateRefs > 0).toBeTruthy();

  const referenceResolutionRate = stats.resolvedRefs / stats.candidateRefs;
  expect(referenceResolutionRate >= U2_REFERENCE_RESOLUTION_RATE_THRESHOLD).toBeTruthy();
});

it('U2 threshold: list_reference_parse_rate stays above baseline', async () => {
  const result = await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'MenuScreenCarrier' });
  const stats = collectU2ReferenceStats([result]);

  expect(stats.listCandidates > 0).toBeTruthy();
  const listReferenceParseRate = stats.parsedListRefs / stats.listCandidates;
  expect(listReferenceParseRate >= U2_LIST_REFERENCE_PARSE_RATE_THRESHOLD).toBeTruthy();
});
