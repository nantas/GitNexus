import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalyzeSummary } from './analyze-runner.js';

test('parseAnalyzeSummary extracts nodes/edges/time', () => {
  const sample = `
Repository indexed successfully (42.3s)
51,172 nodes | 108,578 edges | 2,545 clusters | 300 flows
`;
  const parsed = parseAnalyzeSummary(sample);
  assert.equal(parsed.totalSeconds, 42.3);
  assert.equal(parsed.nodes, 51172);
  assert.equal(parsed.edges, 108578);
});
