import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, summarizeDurations } from './metrics.js';

test('estimateTokens uses chars-per-token heuristic', () => {
  assert.equal(estimateTokens('1234'), 1);
  assert.equal(estimateTokens('12345'), 2);
});

test('summarizeDurations computes median/min/max', () => {
  const out = summarizeDurations([50, 100, 150]);
  assert.equal(out.medianMs, 100);
  assert.equal(out.minMs, 50);
  assert.equal(out.maxMs, 150);
});
