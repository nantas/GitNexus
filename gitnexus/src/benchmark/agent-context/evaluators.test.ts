import { describe, it, expect } from 'vitest'

import { evaluateCheckE, evaluateCheckT, evaluateScenarioChecks } from './evaluators.js';

it('evaluates mandatory target disambiguation check T', () => {
  const stepOutputs = [
    {
      symbol: { uid: 'Class:Sample:Target' },
      target: { id: 'Class:Sample:Target' },
      process_symbols: [{ id: 'Class:Sample:Target', name: 'Target' }],
      definitions: [],
    },
  ];

  const result = evaluateCheckT(stepOutputs, 'Class:Sample:Target');
  expect(result.pass).toBe(true);
});

it('evaluates efficiency check E by tool call budget', () => {
  const result = evaluateCheckE(3, 4);
  expect(result.pass).toBe(true);
});

it('evaluates internal coverage check I from context/impact result names', () => {
  const stepOutputs = [
    {
      incoming: {
        calls: [{ id: 'Method:Sample:RefreshScreen', name: 'RefreshScreen' }],
      },
      outgoing: {
        calls: [{ id: 'Method:Sample:HidePanel', name: 'HidePanel' }],
      },
      byDepth: {
        depth_1: [{ id: 'Method:Sample:SyncState', name: 'SyncState' }],
      },
    },
  ];

  const checks = [
    { id: 'I', internal_anchors: ['Refresh', 'Sync'], min_internal_hits: 2 },
  ];
  const [result] = evaluateScenarioChecks(stepOutputs, checks);
  expect(result.pass).toBe(true);
});
