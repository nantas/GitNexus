import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkAgentContextCommand, resolveAgentContextProfile } from './benchmark-agent-context.js';

test('benchmark-agent-context resolves profile and runs runner', async () => {
  const quick = resolveAgentContextProfile('quick');
  const full = resolveAgentContextProfile('full');
  assert.equal(quick.maxScenarios, 1);
  assert.equal(full.maxScenarios, Number.MAX_SAFE_INTEGER);

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

  assert.equal(calls[0].repo, 'neonspark-v1-subset');
  assert.equal(calls[0].profile.maxScenarios, 1);
  assert.ok(output.some((line) => line.includes('Report:')));
});
