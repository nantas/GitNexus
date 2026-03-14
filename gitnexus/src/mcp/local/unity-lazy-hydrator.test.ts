import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateLazyBindings } from './unity-lazy-hydrator.js';

test('hydrateLazyBindings processes pending paths in bounded chunks', async () => {
  const calls: string[][] = [];
  await hydrateLazyBindings({
    pendingPaths: ['a', 'b', 'c', 'd', 'e'],
    config: { maxPendingPathsPerRequest: 4, batchSize: 2, maxHydrationMs: 5000 },
    resolveBatch: async (paths) => {
      calls.push(paths);
      return new Map();
    },
  });

  assert.deepEqual(calls, [['a', 'b'], ['c', 'd']]);
});

test('parallel requests dedupe same hydration work', async () => {
  let resolveCalls = 0;
  const sharedInput = {
    pendingPaths: ['Assets/A.prefab'],
    config: { maxPendingPathsPerRequest: 10, batchSize: 5, maxHydrationMs: 5000 },
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

  assert.equal(resolveCalls, 1);
});
