import { describe, it, expect } from 'vitest'

import { estimateTokens, summarizeDurations } from './metrics.js';

it('estimateTokens uses chars-per-token heuristic', () => {
  expect(estimateTokens('1234')).toBe(1);
  expect(estimateTokens('12345')).toBe(2);
});

it('summarizeDurations computes median/min/max', () => {
  const out = summarizeDurations([50, 100, 150]);
  expect(out.medianMs).toBe(100);
  expect(out.minMs).toBe(50);
  expect(out.maxMs).toBe(150);
});
