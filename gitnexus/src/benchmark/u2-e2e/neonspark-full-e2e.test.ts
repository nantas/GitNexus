import test from 'node:test';
import assert from 'node:assert/strict';
import { runE2E } from './neonspark-full-e2e.js';

test('runE2E stops on first gate failure and writes checkpoint', async () => {
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

  assert.equal(out.status, 'failed');
  assert.equal(out.failedGate, 'build');
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0].reportDir, '/tmp/u2-e2e-unit');
  assert.equal(checkpoints[0].payload.failedGate, 'build');
});
