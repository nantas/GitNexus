import { describe, it, expect } from 'vitest'

import path from 'node:path';
import { loadAgentContextDataset } from './io.js';

it('loadAgentContextDataset validates required scenario fields', async () => {
  const invalidRoot = path.resolve('src/benchmark/agent-context/__fixtures__/invalid/missing-checks');
  await expect(() => loadAgentContextDataset(invalidRoot)).rejects.toMatch(/missing required field/i);
});

it('loadAgentContextDataset loads valid thresholds and scenarios', async () => {
  const validRoot = path.resolve('src/benchmark/agent-context/__fixtures__/valid');
  const ds = await loadAgentContextDataset(validRoot);
  expect(ds.scenarios.length).toBe(1);
  expect(ds.thresholds.coverage.minPerScenario > 0).toBeTruthy();
});

it('v1 scenario dataset loads exactly 3 scenarios', async () => {
  const v1Root = path.resolve('../benchmarks/agent-context/neonspark-refactor-v1');
  const ds = await loadAgentContextDataset(v1Root);
  expect(ds.scenarios.length).toBe(3);
});
