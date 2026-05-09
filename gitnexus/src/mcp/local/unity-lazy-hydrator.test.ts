import { describe, it, expect } from 'vitest';

import { hydrateLazyBindings } from './unity-lazy-hydrator.js';

it('hydrateLazyBindings processes pending paths in bounded chunks', async () => {
  const calls: string[][] = [];
  await hydrateLazyBindings({
    pendingPaths: ['a', 'b', 'c', 'd', 'e'],
    config: { lazyMaxPaths: 4, lazyBatchSize: 2, lazyMaxMs: 5000 },
    resolveBatch: async (paths) => {
      calls.push(paths);
      return new Map();
    },
  });

  expect(calls).toEqual([['a', 'b'], ['c', 'd']]);
});

it('parallel requests dedupe same hydration work', async () => {
  let resolveCalls = 0;
  const sharedInput = {
    pendingPaths: ['Assets/A.prefab'],
    config: { lazyMaxPaths: 10, lazyBatchSize: 5, lazyMaxMs: 5000 },
    dedupeKey: 'symbol:door::Assets/A.prefab',
    resolveBatch: async (_paths: string[]) => {
      resolveCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return new Map();
    },
  };

  await Promise.all([
    hydrateLazyBindings(sharedInput),
    hydrateLazyBindings(sharedInput),
  ]);

  expect(resolveCalls).toBe(1);
});

it('context lazy hydration returns partial results when budget exceeded and reports diagnostics', async () => {
  const out = await hydrateLazyBindings({
    pendingPaths: ['a', 'b', 'c', 'd'],
    config: { lazyMaxPaths: 4, lazyBatchSize: 2, lazyMaxMs: 1 },
    resolveBatch: async (paths) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Map(paths.map((p) => [p, []]));
    },
  });

  expect(out.resolvedByPath.size).toBe(2);
  expect(((out as any).diagnostics || []).join('\n')).toMatch(/budget exceeded/i);
});

it('summary-only Unity analyze persistence still returns full bindings after lazy hydration', async () => {
  const out = await hydrateLazyBindings({
    pendingPaths: ['Assets/Doors/Door.prefab'],
    config: { lazyMaxPaths: 10, lazyBatchSize: 5, lazyMaxMs: 5000 },
    resolveBatch: async () => new Map([
      ['Assets/Doors/Door.prefab', [{
        resourcePath: 'Assets/Doors/Door.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '114',
        serializedFields: {
          scalarFields: [{ name: 'Shows', value: '1', sourceLayer: 'prefab' }],
          referenceFields: [],
        },
        resolvedReferences: [],
        evidence: { line: 12, lineText: 'm_Script: ...' },
      } as any]],
    ]),
  });
  expect(out.resolvedByPath.get('Assets/Doors/Door.prefab')?.[0]?.serializedFields.scalarFields[0]?.name).toBe('Shows',);
});
