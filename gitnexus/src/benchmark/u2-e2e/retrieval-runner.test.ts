import { describe, it, expect } from 'vitest';

import { containsPlaceholderLeak, runSymbolScenario, summarizePhase5ConfidenceCalibration } from './retrieval-runner.js';
import { loadE2EConfig } from './config.js';


it('runSymbolScenario executes context off/on + deepDive and records metrics', async () => {
  const mockToolRunner = {
    context: async (input: any) => {
      if (input.unity_resources === 'on') {
        return {
          status: 'found',
          hydrationMeta: {
            requestedMode: 'compact',
            effectiveMode: 'compact',
            isComplete: false,
            needsParityRetry: true,
          },
          resourceBindings: [
            {
              resourcePath: 'Assets/Prefabs/UI.prefab',
              resourceType: 'prefab',
              resolvedReferences: [{ uid: 'Class:Foo' }],
            },
          ],
        };
      }
      return { status: 'found' };
    },
    query: async () => ({ process_symbols: [{ id: 'Class:MainUIManager' }] }),
    impact: async () => ({ impactedCount: 1 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(mockToolRunner as any, {
    symbol: 'MainUIManager',
    kind: 'component',
    objectives: ['verify context'],
    deepDivePlan: [{ tool: 'query', input: { query: 'MainUIManager' } }],
  });

  expect(out.steps.length).toBe(3);
  expect(out.steps.every((s) => s.durationMs >= 0)).toBeTruthy();
  expect(out.steps.every((s) => s.totalTokensEst >= 0)).toBeTruthy();
  expect(out.assertions.pass).toBe(true);
});

it('runSymbolScenario injects response_profile=full for legacy context/query steps', async () => {
  const seen: Array<{ tool: string; input: Record<string, unknown> }> = [];
  const runner = {
    context: async (input: Record<string, unknown>) => {
      seen.push({ tool: 'context', input });
      if (input.unity_resources === 'on') {
        return {
          status: 'found',
          hydrationMeta: {
            requestedMode: 'compact',
            effectiveMode: 'compact',
            isComplete: false,
            needsParityRetry: true,
          },
          resourceBindings: [{ resourcePath: 'Assets/Prefabs/UI.prefab', resourceType: 'prefab' }],
        };
      }
      return { status: 'found' };
    },
    query: async (input: Record<string, unknown>) => {
      seen.push({ tool: 'query', input });
      return {
        process_symbols: [{ id: 'Class:MainUIManager' }],
        definitions: [{ name: 'DoorObj', resourceBindings: [{ resourcePath: 'Assets/A.prefab' }] }],
      };
    },
    impact: async (input: Record<string, unknown>) => {
      seen.push({ tool: 'impact', input });
      return { impactedCount: 1 };
    },
    cypher: async (input: Record<string, unknown>) => {
      seen.push({ tool: 'cypher', input });
      return { rows: [] };
    },
  };

  await runSymbolScenario(runner as any, {
    symbol: 'MainUIManager',
    kind: 'component',
    objectives: ['verify context'],
    deepDivePlan: [{ tool: 'query', input: { query: 'MainUIManager' } }],
  });

  const contextCalls = seen.filter((entry) => entry.tool === 'context');
  const queryCalls = seen.filter((entry) => entry.tool === 'query');
  expect(contextCalls.every((entry) => entry.input.response_profile === 'full')).toBe(true);
  expect(queryCalls.every((entry) => entry.input.response_profile === 'full')).toBe(true);
});

it('AssetRef requires context(on) resourceBindings after serializable-class coverage', async () => {
  const noEvidenceRunner = {
    context: async () => ({
      status: 'found',
      hydrationMeta: { requestedMode: 'compact', effectiveMode: 'compact', isComplete: false, needsParityRetry: true },
      resourceBindings: [],
    }),
    query: async () => ({ process_symbols: [] }),
    impact: async () => ({ impactedCount: 0 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(noEvidenceRunner as any, {
    symbol: 'AssetRef',
    kind: 'serializable-class',
    objectives: ['verify usage evidence'],
    deepDivePlan: [{ tool: 'query', input: { query: 'AssetRef usage' } }],
  });

  expect(out.assertions.pass).toBe(false);
  expect(out.assertions.failures.some((f) => f.includes('context(on) must include resourceBindings'))).toBeTruthy();
});

it('AssetRef requires deep-dive evidence even when context(on) has resourceBindings', async () => {
  const noDeepDiveEvidenceRunner = {
    context: async () => ({
      status: 'found',
      hydrationMeta: { requestedMode: 'compact', effectiveMode: 'compact', isComplete: false, needsParityRetry: true },
      resourceBindings: [{ resourcePath: 'Assets/Data/Unlock.asset', resourceType: 'asset' }],
    }),
    query: async () => ({ process_symbols: [] }),
    impact: async () => ({ impactedCount: 0 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(noDeepDiveEvidenceRunner as any, {
    symbol: 'AssetRef',
    kind: 'serializable-class',
    objectives: ['verify usage evidence'],
    deepDivePlan: [{ tool: 'query', input: { query: 'AssetRef usage' } }],
  });

  expect(out.assertions.pass).toBe(false);
  expect(out.assertions.failures.some((f) => f.includes('deep-dive must provide usage/dependency evidence'))).toBeTruthy();
});

it('AssetRef passes when context(on) bindings and deep-dive evidence are both present', async () => {
  const satisfiedRunner = {
    context: async () => ({
      status: 'found',
      hydrationMeta: { requestedMode: 'compact', effectiveMode: 'compact', isComplete: false, needsParityRetry: true },
      resourceBindings: [{ resourcePath: 'Assets/Data/Unlock.asset', resourceType: 'asset' }],
    }),
    query: async () => ({ process_symbols: [{ id: 'Class:Assets/Scripts/UnlockContent.cs:UnlockContent' }] }),
    impact: async () => ({ impactedCount: 0 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(satisfiedRunner as any, {
    symbol: 'AssetRef',
    kind: 'serializable-class',
    objectives: ['verify usage evidence'],
    deepDivePlan: [{ tool: 'query', input: { query: 'AssetRef usage' } }],
  });

  expect(out.assertions.pass).toBe(true);
  expect(out.assertions.failures.length).toBe(0);
});

it('PlayerActor scenario uses context file hint and valid context deep-dive input', async () => {
  const config = await loadE2EConfig('benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json');
  const player = config.symbolScenarios.find((s) => s.symbol === 'PlayerActor');
  expect(player?.contextFileHint).toBe('Assets/NEON/Code/Game/Actors/PlayerActor/PlayerActor.cs');
  expect(player?.deepDivePlan[0]?.tool).toBe('context');
  expect(player?.deepDivePlan[0]?.input?.name).toBe('PlayerActor');
});

it('runSymbolScenario retries context with file hint when response is ambiguous', async () => {
  const hint = 'Assets/NEON/Code/Game/Actors/PlayerActor/PlayerActor.cs';
  const contextCalls: Record<string, unknown>[] = [];
  const runner = {
    context: async (input: Record<string, unknown>) => {
      contextCalls.push(input);
      if (input.unity_resources === 'off') {
        return { status: 'found' };
      }
      if (input.file_path === hint) {
        return {
          status: 'found',
          hydrationMeta: {
            requestedMode: 'compact',
            effectiveMode: 'compact',
            isComplete: false,
            needsParityRetry: true,
          },
          resourceBindings: [
            {
              resourcePath: 'Assets/Prefabs/Player.prefab',
              resourceType: 'prefab',
              resolvedReferences: [{ uid: 'Class:PlayerActor' }],
            },
          ],
        };
      }
      return {
        status: 'ambiguous',
        candidates: [
          {
            uid: 'Class:Assets/NEON/Code/Game/Actors/PlayerActor/PlayerActor.Visual.cs:PlayerActor',
            kind: 'Class',
            filePath: 'Assets/NEON/Code/Game/Actors/PlayerActor/PlayerActor.Visual.cs',
          },
        ],
      };
    },
    query: async () => ({ process_symbols: [] }),
    impact: async () => ({ impactedCount: 0 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(runner as any, {
    symbol: 'PlayerActor',
    kind: 'partial-component',
    contextFileHint: hint,
    objectives: ['verify fallback'],
    deepDivePlan: [{ tool: 'query', input: { query: 'PlayerActor resource binding' } }],
  });

  expect(contextCalls.length).toBe(3);
  expect(contextCalls[2]?.file_path).toBe(hint);
  expect(out.steps[1]?.output?.status).toBe('found');
  expect(out.assertions.pass).toBe(true);
});

it('runSymbolScenario fails when compact context hydrationMeta.needsParityRetry is missing', async () => {
  const runner = {
    context: async (input: Record<string, unknown>) => {
      if (input.unity_resources === 'on') {
        return {
          status: 'found',
          hydrationMeta: { requestedMode: 'compact', effectiveMode: 'compact', isComplete: false },
          resourceBindings: [{ resourcePath: 'Assets/Prefabs/A.prefab', resourceType: 'prefab' }],
        };
      }
      return { status: 'found' };
    },
    query: async () => ({ process_symbols: [{ id: 'Class:A' }] }),
    impact: async () => ({ impactedCount: 1 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(runner as any, {
    symbol: 'MainUIManager',
    kind: 'component',
    objectives: ['verify hydration contract'],
    deepDivePlan: [{ tool: 'query', input: { query: 'MainUIManager' } }],
  });

  expect(out.assertions.pass).toBe(false);
  expect(out.assertions.failures.some((f) => f.includes('hydrationMeta.needsParityRetry'))).toBeTruthy();
});

it('runSymbolScenario fails when query(on) has no unity serialized/resource evidence', async () => {
  const runner = {
    context: async (input: Record<string, unknown>) => {
      if (input.unity_resources === 'on') {
        return {
          status: 'found',
          hydrationMeta: {
            requestedMode: 'compact',
            effectiveMode: 'compact',
            isComplete: false,
            needsParityRetry: true,
          },
          resourceBindings: [{ resourcePath: 'Assets/Prefabs/A.prefab', resourceType: 'prefab' }],
          serializedFields: { scalarFields: [], referenceFields: [] },
        };
      }
      return { status: 'found' };
    },
    query: async () => ({ process_symbols: [{ id: 'Class:A' }] }),
    impact: async () => ({ impactedCount: 1 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(runner as any, {
    symbol: 'MainUIManager',
    kind: 'component',
    objectives: ['verify query evidence gate'],
    deepDivePlan: [{ tool: 'query', input: { query: 'MainUIManager', unity_resources: 'on' } }],
  });

  expect(out.assertions.pass).toBe(false);
  expect(out.assertions.failures.some((f) => f.includes('query(on) must include unity serialized/resource evidence'))).toBeTruthy();
});

it('phase5 confidence calibration fails when low confidence process is missing verification_hint', async () => {
  const runner = {
    context: async (input: Record<string, unknown>) => {
      if (input.unity_resources === 'on') {
        return {
          status: 'found',
          hydrationMeta: {
            requestedMode: 'compact',
            effectiveMode: 'compact',
            isComplete: false,
            needsParityRetry: true,
          },
          resourceBindings: [{ resourcePath: 'Assets/Prefabs/A.prefab', resourceType: 'prefab' }],
        };
      }
      return { status: 'found' };
    },
    query: async () => ({
      processes: [{ confidence: 'low', evidence_mode: 'resource_heuristic' }],
      process_symbols: [{ id: 'Class:A', resourceBindings: [{ resourcePath: 'Assets/Prefabs/A.prefab' }] }],
    }),
    impact: async () => ({ impactedCount: 0 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(runner as any, {
    symbol: 'MainUIManager',
    kind: 'component',
    objectives: ['phase5 low confidence hint gate'],
    deepDivePlan: [{ tool: 'query', input: { query: 'MainUIManager', unity_resources: 'on' } }],
  });

  expect(out.assertions.pass).toBe(false);
  expect(out.assertions.failures.some((f) => /verification_hint/i.test(f))).toBeTruthy();
});

it('phase5 confidence calibration fails when empty process result with unity evidence has no fallback clue', async () => {
  const runner = {
    context: async (input: Record<string, unknown>) => {
      if (input.unity_resources === 'on') {
        return {
          status: 'found',
          hydrationMeta: {
            requestedMode: 'compact',
            effectiveMode: 'compact',
            isComplete: false,
            needsParityRetry: true,
          },
          resourceBindings: [{ resourcePath: 'Assets/Prefabs/A.prefab', resourceType: 'prefab' }],
        };
      }
      return { status: 'found' };
    },
    query: async () => ({
      processes: [],
      process_symbols: [{ id: 'Class:A', resourceBindings: [{ resourcePath: 'Assets/Prefabs/A.prefab' }] }],
    }),
    impact: async () => ({ impactedCount: 0 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(runner as any, {
    symbol: 'MainUIManager',
    kind: 'component',
    objectives: ['phase5 empty process fallback gate'],
    deepDivePlan: [{ tool: 'query', input: { query: 'MainUIManager', unity_resources: 'on' } }],
  });

  expect(out.assertions.pass).toBe(false);
  expect(out.assertions.failures.some((f) => /fallback|empty process/i.test(f))).toBeTruthy();
});

it('phase5 confidence calibration fails when direct static chain is not high confidence', async () => {
  const runner = {
    context: async (input: Record<string, unknown>) => {
      if (input.unity_resources === 'on') {
        return {
          status: 'found',
          hydrationMeta: {
            requestedMode: 'compact',
            effectiveMode: 'compact',
            isComplete: false,
            needsParityRetry: true,
          },
          resourceBindings: [{ resourcePath: 'Assets/Prefabs/A.prefab', resourceType: 'prefab' }],
        };
      }
      return { status: 'found' };
    },
    query: async () => ({
      processes: [{
        confidence: 'medium',
        evidence_mode: 'direct_step',
        process_subtype: 'static_calls',
        verification_hint: { action: 'none', target: 'none', next_command: 'none' },
      }],
      process_symbols: [{ id: 'Class:A', resourceBindings: [{ resourcePath: 'Assets/Prefabs/A.prefab' }] }],
    }),
    impact: async () => ({ impactedCount: 0 }),
    cypher: async () => ({ rows: [] }),
  };

  const out = await runSymbolScenario(runner as any, {
    symbol: 'MainUIManager',
    kind: 'component',
    objectives: ['phase5 direct static confidence gate'],
    deepDivePlan: [{ tool: 'query', input: { query: 'MainUIManager', unity_resources: 'on' } }],
  });

  expect(out.assertions.pass).toBe(false);
  expect(out.assertions.failures.some((f) => /direct.*static.*high/i.test(f))).toBeTruthy();
});

it('phase5 confidence calibration summary requires baseline provenance fields', async () => {
  expect(() => summarizePhase5ConfidenceCalibration({
    current: {
      totalEvaluated: 4,
      falseNegativeCount: 1,
      falseConfidenceCount: 1,
      lowConfidenceHintCovered: 1,
      lowConfidenceCount: 2,
      fallbackCovered: 2,
    },
    baseline: {
      totalEvaluated: 4,
      falseNegativeCount: 2,
      falseConfidenceCount: 2,
    } as any,
  })).toThrow(/baseline provenance/i);
});

it('phase5 confidence calibration detects placeholder leakage in next_command', async () => {
  expect(containsPlaceholderLeak('Inspect <symbol-or-query> later')).toBe(true);
  expect(containsPlaceholderLeak('gitnexus query --unity-resources on')).toBe(false);
});
