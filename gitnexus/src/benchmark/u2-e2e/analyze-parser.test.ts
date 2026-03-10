import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalyzeSummary, compareEstimate } from './analyze-parser.js';

test('parseAnalyzeSummary extracts totalSec and kuzu/fts sec', async () => {
  const summary = await parseAnalyzeSummary('__fixtures__/analyze.log');
  assert.equal(summary.totalSec, 114.8);
  assert.equal(summary.kuzuSec, 73.5);
  assert.equal(summary.ftsSec, 19.6);
});

test('compareEstimate marks in-range status', () => {
  const verdict = compareEstimate(500, { lower: 322.6, upper: 540.1 });
  assert.equal(verdict.status, 'in-range');
});
