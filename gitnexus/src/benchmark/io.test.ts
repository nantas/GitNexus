import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadBenchmarkDataset } from './io.js';

test('loadBenchmarkDataset parses thresholds and jsonl rows', async () => {
  const root = path.resolve('../benchmarks/unity-baseline/v1');
  const ds = await loadBenchmarkDataset(root);
  assert.equal(typeof ds.thresholds.query.precisionMin, 'number');
  assert.ok(ds.symbols.length > 0);
  assert.ok(ds.relations.length > 0);
  assert.ok(ds.tasks.length > 0);
});

test('loadBenchmarkDataset rejects missing required fields', async () => {
  const badRoot = path.resolve('src/benchmark/__fixtures__/bad-dataset');
  await assert.rejects(() => loadBenchmarkDataset(badRoot), /missing required field/i);
});

test('loadBenchmarkDataset parses neonspark-v1 dataset', async () => {
  const root = path.resolve('../benchmarks/unity-baseline/neonspark-v1');
  const ds = await loadBenchmarkDataset(root);
  assert.equal(ds.symbols.length, 20);
  assert.ok(ds.relations.length > 0);
  assert.ok(ds.tasks.some((t) => t.tool === 'query'));
  assert.ok(ds.tasks.some((t) => t.tool === 'context'));
  assert.ok(ds.tasks.some((t) => t.tool === 'impact'));
});

test('loadBenchmarkDataset parses neonspark-v2 dataset', async () => {
  const root = path.resolve('../benchmarks/unity-baseline/neonspark-v2');
  const ds = await loadBenchmarkDataset(root);
  assert.ok(ds.symbols.length >= 40 && ds.symbols.length <= 60);
  assert.ok(ds.relations.length > 0);
  assert.ok(ds.tasks.length >= 24);
  assert.ok(ds.tasks.some((t) => t.tool === 'query'));
  assert.ok(ds.tasks.some((t) => t.tool === 'context'));
  assert.ok(ds.tasks.some((t) => t.tool === 'impact'));
});
