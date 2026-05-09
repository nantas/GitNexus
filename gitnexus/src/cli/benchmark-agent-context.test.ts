import { describe, it, expect } from 'vitest'

import { benchmarkAgentContextCommand, resolveAgentContextProfile } from './benchmark-agent-context.js';

it('benchmark-agent-context resolves profile and runs runner', async () => {
  const quick = resolveAgentContextProfile('quick');
  const full = resolveAgentContextProfile('full');
  expect(quick.maxScenarios).toBe(1);
  expect(full.maxScenarios).toBe(Number.MAX_SAFE_INTEGER);

  const calls: Array<{ repo?: string; profile: { maxScenarios: number } }> = [];
  const output: string[] = [];

  await benchmarkAgentContextCommand('../benchmarks/agent-context/neonspark-refactor-v1', {
    profile: 'quick',
    repoAlias: 'neonspark-v1-subset',
    reportDir: '.gitnexus/benchmark-agent-context-test',
    skipAnalyze: true,
  }, {
    loadDataset: async () => ({
      thresholds: {
        coverage: { minPerScenario: 0.5, suiteAvgMin: 0.5 },
        efficiency: { maxToolCallsPerScenario: 4, suiteAvgMax: 4 },
      },
      scenarios: [],
    }),
    runBenchmark: async (_dataset, options) => {
      calls.push({ repo: options.repo, profile: options.profile });
      return {
        pass: true,
        failures: [],
        reportDir: options.reportDir || '.gitnexus/benchmark-agent-context-test',
        metrics: { avgCoverage: 1, avgToolCalls: 1, mandatoryTargetPassRate: 1 },
        scenarios: [],
      };
    },
    writeReports: async () => {},
    writeLine: (line: string) => output.push(line),
    analyze: async () => ({ stdout: '', stderr: '' }),
  });

  expect(calls[0].repo).toBe('neonspark-v1-subset');
  expect(calls[0].profile.maxScenarios).toBe(1);
  expect(output.some((line) => line.includes('Report:'))).toBeTruthy();
});

it('benchmark-agent-context retries analyze once on null exit failure', async () => {
  let analyzeCalls = 0;
  let runCalls = 0;

  await benchmarkAgentContextCommand('../benchmarks/agent-context/neonspark-refactor-v1', {
    profile: 'quick',
    repoAlias: 'neonspark-v1-subset',
    reportDir: '.gitnexus/benchmark-agent-context-test',
    targetPath: '/tmp/neonspark',
  }, {
    loadDataset: async () => ({
      thresholds: {
        coverage: { minPerScenario: 0.5, suiteAvgMin: 0.5 },
        efficiency: { maxToolCallsPerScenario: 4, suiteAvgMax: 4 },
      },
      scenarios: [],
    }),
    runBenchmark: async () => {
      runCalls += 1;
      return {
        pass: true,
        failures: [],
        reportDir: '.gitnexus/benchmark-agent-context-test',
        metrics: { avgCoverage: 1, avgToolCalls: 1, mandatoryTargetPassRate: 1 },
        scenarios: [],
      };
    },
    writeReports: async () => {},
    writeLine: () => {},
    analyze: async () => {
      analyzeCalls += 1;
      if (analyzeCalls === 1) {
        throw new Error('analyze failed: null');
      }
      return { stdout: '', stderr: '' };
    },
  });

  expect(analyzeCalls).toBe(2);
  expect(runCalls).toBe(1);
});
