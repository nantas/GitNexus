import { describe, it, expect } from 'vitest';

import { projectUnityBindings } from './unity-enrichment.js';
import { hydrateLazyBindings } from './unity-lazy-hydrator.js';
import { attachUnityHydrationMeta, mergeParityUnityBindings, mergeUnityBindings } from './unity-runtime-hydration.js';

it('summary-only rows hydrate and merge into full bindings with preserved field coverage', async () => {
  const projected = projectUnityBindings([
    {
      relationType: 'UNITY_RESOURCE_SUMMARY',
      relationReason: JSON.stringify({ resourceType: 'prefab', bindingKinds: ['direct', 'nested'], lightweight: true }),
      resourcePath: 'Assets/Doors/Door.prefab',
      payload: '',
    },
    {
      relationType: 'UNITY_RESOURCE_SUMMARY',
      relationReason: JSON.stringify({ resourceType: 'prefab', bindingKinds: ['prefab-instance'], lightweight: true }),
      resourcePath: 'Assets/Doors/Boss.prefab',
      payload: '',
    },
    {
      resourcePath: 'Assets/Scene/Test.unity',
      relationType: 'UNITY_COMPONENT_INSTANCE',
      relationReason: 'scene-override',
      payload: JSON.stringify({
        resourcePath: 'Assets/Scene/Test.unity',
        resourceType: 'scene',
        bindingKind: 'scene-override',
        componentObjectId: '11400000',
        evidence: { line: 9, lineText: 'm_Script: ...' },
        serializedFields: {
          scalarFields: [{ name: 'needPause', value: '1', valueType: 'number', sourceLayer: 'scene' }],
          referenceFields: [],
        },
      }),
    },
  ]);

  const pendingPaths = [...new Set(
    projected.resourceBindings
      .filter((binding) => binding.lightweight)
      .map((binding) => binding.resourcePath),
  )];

  const hydration = await hydrateLazyBindings({
    pendingPaths,
    config: { lazyMaxPaths: 10, lazyBatchSize: 10, lazyMaxMs: 5000 },
    resolveBatch: async () => new Map([
      ['Assets/Doors/Door.prefab', [
        {
          resourcePath: 'Assets/Doors/Door.prefab',
          resourceType: 'prefab',
          bindingKind: 'direct',
          componentObjectId: '114',
          lightweight: false,
          evidence: { line: 12, lineText: 'm_Script: ...' },
          serializedFields: {
            scalarFields: [{ name: 'Shows', value: '1', valueType: 'number', sourceLayer: 'prefab' }],
            referenceFields: [],
          },
          resolvedReferences: [],
          assetRefPaths: [],
        } as any,
        {
          resourcePath: 'Assets/Doors/Door.prefab',
          resourceType: 'prefab',
          bindingKind: 'nested',
          componentObjectId: '115',
          lightweight: false,
          evidence: { line: 33, lineText: 'm_Script: ...' },
          serializedFields: {
            scalarFields: [{ name: 'ToSecretRoom', value: '0', valueType: 'number', sourceLayer: 'prefab' }],
            referenceFields: [],
          },
          resolvedReferences: [],
          assetRefPaths: [],
        } as any,
      ]],
      ['Assets/Doors/Boss.prefab', [
        {
          resourcePath: 'Assets/Doors/Boss.prefab',
          resourceType: 'prefab',
          bindingKind: 'prefab-instance',
          componentObjectId: '210',
          lightweight: false,
          evidence: { line: 19, lineText: 'm_Script: ...' },
          serializedFields: { scalarFields: [], referenceFields: [] },
          resolvedReferences: [],
          assetRefPaths: [],
        } as any,
      ]],
    ]),
  });

  const merged = mergeUnityBindings(projected.resourceBindings, hydration.resolvedByPath);
  expect(merged.length).toBe(4);
  expect(merged.filter((row) => row.resourcePath === 'Assets/Doors/Door.prefab').length).toBe(2);
  expect(merged.filter((row) => row.resourcePath === 'Assets/Doors/Boss.prefab').length).toBe(1);
  expect(merged.filter((row) => row.resourcePath === 'Assets/Scene/Test.unity').length).toBe(1);
  expect(merged.some((row) => row.componentObjectId === 'summary')).toBe(false);
  expect(merged.some((row) => row.lightweight)).toBe(false);

  const scalarFieldNames = merged.flatMap((row) => row.serializedFields.scalarFields.map((field) => field.name));
  expect(scalarFieldNames.includes('Shows')).toBe(true);
  expect(scalarFieldNames.includes('ToSecretRoom')).toBe(true);
  expect(scalarFieldNames.includes('needPause')).toBe(true);
});

it('mergeUnityBindings keeps lightweight summaries when hydration has no expanded rows', async () => {
  const projected = projectUnityBindings([
    {
      relationType: 'UNITY_RESOURCE_SUMMARY',
      relationReason: JSON.stringify({ resourceType: 'prefab', bindingKinds: ['direct'], lightweight: true }),
      resourcePath: 'Assets/Doors/Unresolved.prefab',
      payload: '',
    },
  ]);

  const merged = mergeUnityBindings(projected.resourceBindings, new Map());
  expect(merged.length).toBe(1);
  expect(merged[0]?.resourcePath).toBe('Assets/Doors/Unresolved.prefab');
  expect(merged[0]?.lightweight).toBe(true);
  expect(merged[0]?.componentObjectId).toBe('summary');
});

it('mergeParityUnityBindings prefers full resolved rows and preserves non-lightweight base evidence', () => {
  const merged = mergeParityUnityBindings(
    [
      {
        resourcePath: 'Assets/Doors/Legacy.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: 'legacy-1',
        lightweight: false,
        evidence: { line: 1, lineText: 'legacy' },
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
        assetRefPaths: [],
      } as any,
    ],
    [
      {
        resourcePath: 'Assets/Doors/New.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: 'new-1',
        lightweight: false,
        evidence: { line: 2, lineText: 'new' },
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
        assetRefPaths: [],
      } as any,
      {
        resourcePath: 'Assets/Doors/New.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: 'new-1',
        lightweight: false,
        evidence: { line: 2, lineText: 'new' },
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
        assetRefPaths: [],
      } as any,
    ],
  );

  expect(merged.length).toBe(2);
  expect(merged.some((row) => row.componentObjectId === 'legacy-1')).toBe(true);
  expect(merged.some((row) => row.componentObjectId === 'new-1')).toBe(true);
  expect(merged.some((row) => row.lightweight)).toBe(false);
});

it('attachUnityHydrationMeta annotates payload with requested/effective mode and counts', () => {
  const payload = projectUnityBindings([
    {
      relationType: 'UNITY_RESOURCE_SUMMARY',
      relationReason: JSON.stringify({ resourceType: 'prefab', bindingKinds: ['direct'], lightweight: true }),
      resourcePath: 'Assets/Doors/Door.prefab',
      payload: '',
    },
  ]);

  const out = attachUnityHydrationMeta(payload, {
    requestedMode: 'parity',
    effectiveMode: 'compact',
    elapsedMs: 42,
    fallbackToCompact: true,
    hasExpandableBindings: true,
  });

  expect(out.hydrationMeta?.requestedMode).toBe('parity');
  expect(out.hydrationMeta?.effectiveMode).toBe('compact');
  expect(out.hydrationMeta?.elapsedMs).toBe(42);
  expect(out.hydrationMeta?.fallbackToCompact).toBe(true);
  expect(out.hydrationMeta?.resourceBindingCount).toBe(1);
  expect(out.hydrationMeta?.unityDiagnosticsCount).toBe(0);
  expect(out.hydrationMeta?.isComplete).toBe(false);
  expect(out.hydrationMeta?.needsParityRetry).toBe(true);
  expect(out.hydrationMeta?.retryHint).toBe('rerun_with_unity_hydration=parity');
  expect(out.hydrationMeta?.completenessReason.includes('mode_compact')).toBe(true);
  expect(out.hydrationMeta?.completenessReason.includes('fallback_to_compact')).toBe(true);
  expect(out.hydrationMeta?.completenessReason.includes('lightweight_bindings_remaining')).toBe(true);
});

it('attachUnityHydrationMeta marks parity payload complete when no fallback/diagnostics remain', () => {
  const payload = projectUnityBindings([
    {
      resourcePath: 'Assets/Scene/Test.unity',
      relationType: 'UNITY_COMPONENT_INSTANCE',
      relationReason: 'scene-override',
      payload: JSON.stringify({
        resourcePath: 'Assets/Scene/Test.unity',
        resourceType: 'scene',
        bindingKind: 'scene-override',
        componentObjectId: '11400000',
        evidence: { line: 9, lineText: 'm_Script: ...' },
        serializedFields: { scalarFields: [], referenceFields: [] },
      }),
    },
  ]);

  const out = attachUnityHydrationMeta(payload, {
    requestedMode: 'parity',
    effectiveMode: 'parity',
    elapsedMs: 12,
    fallbackToCompact: false,
    hasExpandableBindings: false,
  });

  expect(out.hydrationMeta?.isComplete).toBe(true);
  expect(out.hydrationMeta?.needsParityRetry).toBe(false);
  expect(out.hydrationMeta?.retryHint).toBe(undefined);
  expect(out.hydrationMeta?.completenessReason).toEqual([]);
});

it('attachUnityHydrationMeta marks compact payload complete when no expandable bindings remain', () => {
  const payload = projectUnityBindings([
    {
      resourcePath: 'Assets/Scene/Test.unity',
      relationType: 'UNITY_COMPONENT_INSTANCE',
      relationReason: 'scene-override',
      payload: JSON.stringify({
        resourcePath: 'Assets/Scene/Test.unity',
        resourceType: 'scene',
        bindingKind: 'scene-override',
        componentObjectId: '11400000',
        evidence: { line: 9, lineText: 'm_Script: ...' },
        serializedFields: { scalarFields: [], referenceFields: [] },
      }),
    },
  ]);

  const out = attachUnityHydrationMeta(payload, {
    requestedMode: 'compact',
    effectiveMode: 'compact',
    elapsedMs: 5,
    fallbackToCompact: false,
    hasExpandableBindings: false,
  });

  expect(out.hydrationMeta?.isComplete).toBe(true);
  expect(out.hydrationMeta?.needsParityRetry).toBe(false);
  expect(out.hydrationMeta?.completenessReason).toEqual([]);
});

it('attachUnityHydrationMeta marks compact payload incomplete when expandable bindings remain', () => {
  const payload = projectUnityBindings([
    {
      relationType: 'UNITY_RESOURCE_SUMMARY',
      relationReason: JSON.stringify({ resourceType: 'prefab', bindingKinds: ['direct'], lightweight: true }),
      resourcePath: 'Assets/Doors/Door.prefab',
      payload: '',
    },
  ]);

  const out = attachUnityHydrationMeta(payload, {
    requestedMode: 'compact',
    effectiveMode: 'compact',
    elapsedMs: 5,
    fallbackToCompact: false,
    hasExpandableBindings: true,
  });

  expect(out.hydrationMeta?.isComplete).toBe(false);
  expect(out.hydrationMeta?.needsParityRetry).toBe(true);
  expect(out.hydrationMeta?.completenessReason.includes('mode_compact')).toBe(true);
});
