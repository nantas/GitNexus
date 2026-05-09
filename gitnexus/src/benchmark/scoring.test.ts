import { describe, it, expect } from 'vitest'

import { computePR, computeF1, evaluateGates } from './scoring.js';

it('computePR returns precision and recall', () => {
  const pr = computePR(9, 10, 12);
  expect(pr.precision.toFixed(2)).toBe('0.90');
  expect(pr.recall.toFixed(2)).toBe('0.75');
});

it('evaluateGates fails when one hard threshold fails', () => {
  const result = evaluateGates(
    {
      queryPrecision: 0.9,
      queryRecall: 0.84,
      contextImpactF1: 0.82,
      smokePassRate: 1,
      perfRegressionPct: 10,
    },
    {
      query: { precisionMin: 0.9, recallMin: 0.85 },
      contextImpact: { f1Min: 0.8 },
      smoke: { passRateMin: 1 },
      performance: { analyzeTimeRegressionMaxPct: 15 },
    },
  );
  expect(result.pass).toBe(false);
  expect(result.failures.includes('query.recall')).toBeTruthy();
});
