import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalVerdictMarkdown } from './report.js';

test('buildFinalVerdictMarkdown includes estimate comparison and symbol outcomes', () => {
  const md = buildFinalVerdictMarkdown({
    runId: 'test-run',
    buildTimings: { buildMs: 1200, pipelineProfileMs: 2500, analyzeSec: 114.8 },
    estimateComparison: { status: 'in-range', inRange: true, actualSec: 500, lower: 322.6, upper: 540.1, deltaSec: 0 },
    retrievalSummary: {
      symbols: [
        { symbol: 'MainUIManager', pass: true, stepCount: 3 },
        { symbol: 'CoinPowerUp', pass: true, stepCount: 3 },
      ],
      tokenSummary: { totalTokensEst: 3456, totalDurationMs: 876 },
      failures: [],
    },
    failures: [],
  });

  assert.match(md, /Estimate Comparison/);
  assert.match(md, /MainUIManager/);
  assert.match(md, /CoinPowerUp/);
});
