import { describe, it, expect } from 'vitest';

import { buildMissingEvidenceFromHydrationMeta, hydrateUnityForSymbol } from './unity-runtime-hydration.js';

it('hydrateUnityForSymbol(compact) marks needsParityRetry when lightweight bindings remain', async () => {
  const out = await hydrateUnityForSymbol({
    mode: 'compact',
    basePayload: {
      resourceBindings: [
        {
          resourcePath: 'Assets/A.prefab',
          resourceType: 'prefab',
          bindingKind: 'direct',
          componentObjectId: 'summary',
          lightweight: true,
          evidence: { line: 0, lineText: '' },
          serializedFields: { scalarFields: [], referenceFields: [] },
          resolvedReferences: [],
          assetRefPaths: [],
        },
      ],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    },
    deps: {
      executeQuery: async () => [],
      repoPath: '/tmp/repo',
      storagePath: '/tmp/storage',
      indexedCommit: 'abc123',
    },
    symbol: {
      uid: 'Class:Assets/Scripts/A.cs:A',
      name: 'A',
      filePath: 'Assets/Scripts/A.cs',
    },
    runtime: {
      shouldEnableWarmup: () => false,
      resolveLazyConfig: () => ({ maxPendingPathsPerRequest: 10, batchSize: 10, maxHydrationMs: 5000 }),
      hydrateLazyBindings: async () => ({
        resolvedByPath: new Map(),
        timedOut: false,
        elapsedMs: 1,
        diagnostics: [],
      }),
      readOverlayBindings: async () => new Map(),
      upsertOverlayBindings: async () => undefined,
    },
  } as any);

  expect(out.hydrationMeta?.effectiveMode).toBe('compact');
  expect(out.hydrationMeta?.needsParityRetry).toBe(true);
});

it('hydrateUnityForSymbol(parity) sets isComplete=true on parity success', async () => {
  const out = await hydrateUnityForSymbol({
    mode: 'parity',
    basePayload: {
      resourceBindings: [
        {
          resourcePath: 'Assets/A.prefab',
          resourceType: 'prefab',
          bindingKind: 'direct',
          componentObjectId: 'summary',
          lightweight: true,
          evidence: { line: 0, lineText: '' },
          serializedFields: { scalarFields: [], referenceFields: [] },
          resolvedReferences: [],
          assetRefPaths: [],
        },
      ],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    },
    deps: {
      executeQuery: async () => [],
      repoPath: '/tmp/repo',
      storagePath: '/tmp/storage',
      indexedCommit: 'abc123',
    },
    symbol: {
      uid: 'Class:Assets/Scripts/A.cs:A',
      name: 'A',
      filePath: 'Assets/Scripts/A.cs',
    },
    runtime: {
      shouldEnableWarmup: () => false,
      readParityCache: async () => null,
      upsertParityCache: async () => undefined,
      loadParitySeed: async () => null,
      buildScanContext: async () => ({}) as any,
      resolveBindings: async () => ({
        resourceBindings: [
          {
            resourcePath: 'Assets/A.prefab',
            resourceType: 'prefab',
            bindingKind: 'direct',
            componentObjectId: '114',
            lightweight: false,
            evidence: { line: 1, lineText: 'stub' },
            serializedFields: { scalarFields: [], referenceFields: [] },
            resolvedReferences: [],
            assetRefPaths: [],
          },
        ],
        unityDiagnostics: [],
      }),
    },
  } as any);

  expect(out.hydrationMeta?.effectiveMode).toBe('parity');
  expect(out.hydrationMeta?.isComplete).toBe(true);
});

it('buildMissingEvidenceFromHydrationMeta maps incomplete reasons', () => {
  const missing = buildMissingEvidenceFromHydrationMeta({
    requestedMode: 'compact',
    effectiveMode: 'compact',
    elapsedMs: 1,
    fallbackToCompact: false,
    resourceBindingCount: 1,
    unityDiagnosticsCount: 0,
    isComplete: false,
    completenessReason: ['lightweight_bindings_remaining', 'budget_exceeded'],
    needsParityRetry: true,
  });
  expect(missing).toEqual(['lightweight_bindings_remaining', 'budget_exceeded']);
});
