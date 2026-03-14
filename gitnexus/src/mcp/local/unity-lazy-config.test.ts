import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveUnityLazyConfig } from './unity-lazy-config.js';

test('resolveUnityLazyConfig provides safe defaults', () => {
  const cfg = resolveUnityLazyConfig({});
  assert.equal(cfg.maxPendingPathsPerRequest, 120);
  assert.equal(cfg.batchSize, 30);
  assert.equal(cfg.maxHydrationMs, 5000);
});
