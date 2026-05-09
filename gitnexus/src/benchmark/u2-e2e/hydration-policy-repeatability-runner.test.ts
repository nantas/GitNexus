import { describe, it, expect } from 'vitest';

import { buildHydrationPolicyRepeatabilityReport } from './hydration-policy-repeatability-runner.js';


it('phase4 hydration policy repeatability report tracks consistency and compatibility', async () => {
  const report = await buildHydrationPolicyRepeatabilityReport({ repoAlias: 'GitNexus' });
  expect(report.repeatability.fast.consistent).toBe(true);
  expect(report.repeatability.balanced.consistent).toBe(true);
  expect(report.repeatability.strict.consistent).toBe(true);
  expect(report.contractCompatibility.needsParityRetryRetained).toBe(true);
});
