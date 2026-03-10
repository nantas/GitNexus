import test from 'node:test';
import assert from 'node:assert/strict';
import { runSymbolScenario } from './retrieval-runner.js';
import { loadE2EConfig } from './config.js';

test('runSymbolScenario executes context off/on + deepDive and records metrics', async () => {
  const mockToolRunner = {
    context: async (input: any) => {
      if (input.unity_resources === 'on') {
        return {
          status: 'found',
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

  assert.equal(out.steps.length, 3);
  assert.ok(out.steps.every((s) => s.durationMs >= 0));
  assert.ok(out.steps.every((s) => s.totalTokensEst >= 0));
  assert.equal(out.assertions.pass, true);
});

test('AssetRef allows empty resourceBindings but requires deep-dive evidence', async () => {
  const noEvidenceRunner = {
    context: async () => ({ status: 'found', resourceBindings: [] }),
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

  assert.equal(out.assertions.pass, false);
  assert.ok(out.assertions.failures.some((f) => f.includes('deep-dive')));
});

test('PlayerActor scenario uses context file hint and valid context deep-dive input', async () => {
  const config = await loadE2EConfig('benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json');
  const player = config.symbolScenarios.find((s) => s.symbol === 'PlayerActor');
  assert.equal(player?.contextFileHint, 'Assets/NEON/Code/Game/Actors/PlayerActor/PlayerActor.cs');
  assert.equal(player?.deepDivePlan[0]?.tool, 'context');
  assert.equal(player?.deepDivePlan[0]?.input?.name, 'PlayerActor');
});

test('runSymbolScenario retries context with file hint when response is ambiguous', async () => {
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

  assert.equal(contextCalls.length, 3);
  assert.equal(contextCalls[2]?.file_path, hint);
  assert.equal(out.steps[1]?.output?.status, 'found');
  assert.equal(out.assertions.pass, true);
});
