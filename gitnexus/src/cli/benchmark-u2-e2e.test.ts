import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveU2E2EArgs } from './benchmark-u2-e2e.js';

test('benchmark-u2-e2e resolves config and report directory', () => {
  const out = resolveU2E2EArgs(['--config', 'benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json']);
  assert.match(out.configPath, /neonspark-full-u2-e2e\.config\.json$/);
});
