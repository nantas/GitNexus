import { describe, it, expect } from 'vitest'

import { computeNumericStats, evaluateMetricsThresholds } from './u2-performance-sampler.js';

it('computeNumericStats returns stable summary fields', () => {
  const stats = computeNumericStats([120, 80, 100]);
  expect(stats.mean).toBe(100);
  expect(stats.median).toBe(100);
  expect(stats.min).toBe(80);
  expect(stats.max).toBe(120);
  expect(stats.spread).toBe(40);
});

it('evaluateMetricsThresholds marks pass/fail per metric', () => {
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
  expect(verdict.pass).toBe(true);
  expect(verdict.metrics.metaIndexMs?.pass).toBe(true);
  expect(verdict.metrics.referenceResolveMs?.pass).toBe(true);
  expect(verdict.metrics.graphReferenceWriteMs?.pass).toBe(true);

  const failing = evaluateMetricsThresholds(metrics, {
    ...thresholds,
    referenceResolveMs: { medianMax: 2500, maxMax: 2800 },
  });
  expect(failing.pass).toBe(false);
  expect(failing.metrics.referenceResolveMs?.pass).toBe(false);
});
