import test from 'node:test';
import assert from 'node:assert/strict';
import { computePR, computeF1, evaluateGates } from './scoring.js';

test('computePR returns precision and recall', () => {
  const pr = computePR(9, 10, 12);
  assert.equal(pr.precision.toFixed(2), '0.90');
  assert.equal(pr.recall.toFixed(2), '0.75');
});

test('evaluateGates fails when one hard threshold fails', () => {
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
  assert.equal(result.pass, false);
  assert.ok(result.failures.includes('query.recall'));
});
