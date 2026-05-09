import { describe, it, expect } from 'vitest';

import { buildPhase1ProcessRefAcceptanceReport } from './phase1-process-ref-acceptance-runner.js';


it('phase1 process_ref acceptance report emits readable + stable metrics', async () => {
  const report = await buildPhase1ProcessRefAcceptanceReport({
    repoAlias: 'GitNexus',
  });

  expect(report.metrics.process_ref.readable_rate).toBe(1);
  expect(report.metrics.derived_id_stability_rate).toBe(1);
});
