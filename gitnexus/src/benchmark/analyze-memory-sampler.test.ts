import { describe, it, expect } from 'vitest'

import { buildAnalyzeMemoryReport } from './analyze-memory-sampler.js';

it('buildAnalyzeMemoryReport summarizes analyze and query measurements', () => {
  const report = buildAnalyzeMemoryReport({
    analyze: { realSec: 10, maxRssBytes: 1024, phases: { pipelineSec: 3, kuzuSec: 5, ftsSec: 1 } },
    queryCold: { realSec: 2, maxRssBytes: 512, resourceBindings: 4, unityDiagnostics: [] },
    queryWarm: { realSec: 1, maxRssBytes: 256, resourceBindings: 4, unityDiagnostics: [] },
  });
  expect(report.summary.analyzeRealSec).toBe(10);
  expect(report.summary.coldResourceBindings).toBe(4);
});
