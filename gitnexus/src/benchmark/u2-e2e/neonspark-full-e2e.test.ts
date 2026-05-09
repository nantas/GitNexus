import { describe, it, expect } from 'vitest'

import { extractSingleCountFromCypherResult, runE2E } from './neonspark-full-e2e.js';

it('runE2E stops on first gate failure and writes checkpoint', async () => {
  const checkpoints: Array<{ reportDir: string; payload: any }> = [];

  const out = await runE2E({
    runId: 'unit-test-run',
    reportDir: '/tmp/u2-e2e-unit',
    gates: {
      preflight: async () => ({ ok: true }),
      build: async () => {
        throw new Error('build failed');
      },
      'pipeline-profile': async () => ({ skipped: true }),
      analyze: async () => ({ totalSec: 1 }),
      'estimate-compare': async () => ({ status: 'in-range' }),
      retrieval: async () => ({ symbols: [] }),
      'final-report': async () => ({ written: true }),
    },
    writeCheckpoint: async (reportDir, payload) => {
      checkpoints.push({ reportDir, payload });
    },
  });

  expect(out.status).toBe('failed');
  expect(out.failedGate).toBe('build');
  expect(checkpoints.length).toBe(1);
  expect(checkpoints[0].reportDir).toBe('/tmp/u2-e2e-unit');
  expect(checkpoints[0].payload.failedGate).toBe('build');
});

it('extractSingleCountFromCypherResult parses markdown-formatted cypher output', () => {
  const count = extractSingleCountFromCypherResult({
    markdown: '| serializedTypeEdgeCount |\n| --- |\n| 3791 |',
    row_count: 1,
  });
  expect(count).toBe(3791);
});

it('extractSingleCountFromCypherResult parses raw row output', () => {
  const count = extractSingleCountFromCypherResult([{ serializedTypeEdgeCount: 42 }]);
  expect(count).toBe(42);
});
