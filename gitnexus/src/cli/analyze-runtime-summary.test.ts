import { describe, it, expect } from 'vitest'

import { toPipelineRuntimeSummary } from './analyze-runtime-summary.js';

it('toPipelineRuntimeSummary drops graph reference and preserves reporting fields', () => {
  const out = toPipelineRuntimeSummary({
    totalFileCount: 12,
    communityResult: { stats: { totalCommunities: 3 } },
    processResult: { stats: { totalProcesses: 2 } },
    unityResult: { diagnostics: ['scanContext: scripts=1'] },
    unityRuleBindingResult: { edgesInjected: 1, ruleResults: [], diagnostics: { summary: [] } },
    csharpPreprocDiagnostics: {
      enabled: true,
      defineSymbolCount: 2,
      normalizedFiles: 1,
      fallbackFiles: 0,
      skippedFiles: 3,
      expressionErrors: 0,
      undefinedSymbols: [],
    },
  } as any);

  expect('graph' in out).toBe(false);
  expect(out.totalFileCount).toBe(12);
  expect(out.communityResult?.stats.totalCommunities).toBe(3);
  expect(out.unityRuleBindingResult?.edgesInjected).toBe(1);
  expect(out.csharpPreprocDiagnostics?.normalizedFiles).toBe(1);
});
