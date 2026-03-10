import test from 'node:test';
import assert from 'node:assert/strict';
import { computeNumericStats, evaluateMetricsThresholds } from './u2-performance-sampler.js';

test('computeNumericStats returns stable summary fields', () => {
  const stats = computeNumericStats([120, 80, 100]);
  assert.equal(stats.mean, 100);
  assert.equal(stats.median, 100);
  assert.equal(stats.min, 80);
  assert.equal(stats.max, 120);
  assert.equal(stats.spread, 40);
});

test('evaluateMetricsThresholds marks pass/fail per metric', () => {
  const metrics = {
    metaIndexMs: [4100, 4000, 4200],
    referenceResolveMs: [3000, 2900, 3100],
    graphReferenceWriteMs: [250, 240, 260],
  };
  const thresholds = {
    metaIndexMs: { medianMax: 4500, maxMax: 5000 },
    referenceResolveMs: { medianMax: 3200, maxMax: 3600 },
    graphReferenceWriteMs: { medianMax: 260, maxMax: 300 },
  };

  const verdict = evaluateMetricsThresholds(metrics, thresholds);
  assert.equal(verdict.pass, true);
  assert.equal(verdict.metrics.metaIndexMs?.pass, true);
  assert.equal(verdict.metrics.referenceResolveMs?.pass, true);
  assert.equal(verdict.metrics.graphReferenceWriteMs?.pass, true);

  const failing = evaluateMetricsThresholds(metrics, {
    ...thresholds,
    referenceResolveMs: { medianMax: 2500, maxMax: 2800 },
  });
  assert.equal(failing.pass, false);
  assert.equal(failing.metrics.referenceResolveMs?.pass, false);
});
