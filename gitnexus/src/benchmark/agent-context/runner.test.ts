import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentContextBenchmark } from './runner.js';
import type { AgentContextDataset } from './types.js';

test('runner computes per-scenario coverage and suite averages', async () => {
  const dataset: AgentContextDataset = {
    thresholds: {
      coverage: { minPerScenario: 0.5, suiteAvgMin: 0.5 },
      efficiency: { maxToolCallsPerScenario: 4, suiteAvgMax: 4 },
    },
    scenarios: [
      {
        scenario_id: 'sample-refactor-context',
        target_uid: 'Class:Sample:Target',
        tool_plan: [
          { tool: 'query', input: { query: 'Target' } },
          { tool: 'context', input: { uid: 'Class:Sample:Target' } },
          { tool: 'impact', input: { target: 'Target', direction: 'upstream' } },
        ],
        checks: [
          { id: 'T', required_uid: 'Class:Sample:Target' },
          { id: 'U', min_incoming: 1 },
          { id: 'D', min_outgoing: 1 },
          { id: 'B', min_impacted: 1 },
          { id: 'I', internal_anchors: ['AddMinion'], min_internal_hits: 1 },
          { id: 'E', max_tool_calls: 4 },
        ],
      },
    ],
  };

  const fakeRunner = {
    query: async () => ({
      process_symbols: [{ id: 'Class:Sample:Target', name: 'Target' }],
      definitions: [{ id: 'Method:Sample:AddMinion', name: 'AddMinion' }],
      symbol: { uid: 'Class:Sample:Target', name: 'Target' },
    }),
    context: async () => ({
      incoming: { depth_1: [{ id: 'Caller:1' }] },
      outgoing: { depth_1: [{ id: 'Callee:1' }] },
      symbol: { uid: 'Class:Sample:Target', name: 'Target' },
    }),
    impact: async () => ({
      impactedCount: 3,
      target: { id: 'Class:Sample:Target', name: 'Target' },
    }),
    cypher: async () => ({ rows: [] }),
    close: async () => {},
  };

  const result = await runAgentContextBenchmark(dataset, {
    repo: 'sample-repo',
    runner: fakeRunner,
  });

  assert.ok(result.metrics.avgCoverage > 0);
  assert.ok(result.scenarios[0].checks.length > 0);
});
