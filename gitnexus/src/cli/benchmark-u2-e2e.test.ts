import { describe, it, expect } from 'vitest'

import { resolveU2E2EArgs } from './benchmark-u2-e2e.js';

it('benchmark-u2-e2e resolves config and report directory', () => {
  const out = resolveU2E2EArgs(['--config', 'benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json']);
  expect(out.configPath).toMatch(/neonspark-full-u2-e2e\.config\.json$/);
});
