import { describe, it, expect } from 'vitest';

import { buildPhase2RuntimeClaimAcceptanceReport } from './phase2-runtime-claim-acceptance-runner.js';


it('phase2 runtime_claim acceptance report tracks contract + failure classification coverage', async () => {
  const report = await buildPhase2RuntimeClaimAcceptanceReport({ repoAlias: 'GitNexus' });

  expect(report.claim_fields_presence.rule_id).toBe(true);
  expect(report.claim_fields_presence.rule_version).toBe(true);
  expect(report.coverage_pass).toBe(true);
  expect(report.failure_classification_coverage.includes('rule_not_matched')).toBe(true);
  expect(report.failure_classification_coverage.includes('rule_matched_but_evidence_missing')).toBe(true);
  expect(report.failure_classification_coverage.includes('rule_matched_but_verification_failed')).toBe(true);
});
