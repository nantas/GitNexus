import { describe, it, expect } from 'vitest'

import { parseAnalyzeSummary, compareEstimate } from './analyze-parser.js';

it('parseAnalyzeSummary extracts totalSec and kuzu/fts sec', async () => {
  const summary = await parseAnalyzeSummary('__fixtures__/analyze.log');
  expect(summary.totalSec).toBe(114.8);
  expect(summary.kuzuSec).toBe(73.5);
  expect(summary.ftsSec).toBe(19.6);
});

it('compareEstimate marks in-range status', () => {
  const verdict = compareEstimate(500, { lower: 322.6, upper: 540.1 });
  expect(verdict.status).toBe('in-range');
});
