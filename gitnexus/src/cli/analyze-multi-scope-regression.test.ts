import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipelineFromRepo } from '../core/ingestion/pipeline.js';

test('runPipelineFromRepo deduplicates overlapping scope matches and reports diagnostics', { timeout: 60_000 }, async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixtureRepo = path.resolve(here, '../../../benchmarks/fixtures/unity-mini');

  const result = await runPipelineFromRepo(
    fixtureRepo,
    () => {},
    {
      includeExtensions: ['.cs'],
      scopeRules: ['Assets', 'Assets/Scripts'],
    },
  );

  const fileNodes = [...result.graph.iterNodes()].filter((node) => node.label === 'File');
  const uniqueFilePaths = new Set(fileNodes.map((node) => String(node.properties.filePath)));

  assert.equal(uniqueFilePaths.size, 3);
  assert.equal(fileNodes.length, 3);
  assert.equal(result.scopeDiagnostics?.appliedRuleCount, 2);
  assert.equal(result.scopeDiagnostics?.matchedFiles, 3);
  assert.equal(result.scopeDiagnostics?.overlapFiles, 3);
  assert.equal(result.scopeDiagnostics?.dedupedMatchCount, 3);
  assert.equal(result.scopeDiagnostics?.normalizedCollisions.length, 0);
});

test('pipeline forwards extension-filtered scoped paths to unity enrich', { timeout: 60_000 }, async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixtureRepo = path.resolve(here, '../../src/core/unity/__fixtures__/mini-unity');

  const result = await runPipelineFromRepo(
    fixtureRepo,
    () => {},
    {
      includeExtensions: ['.cs'],
      scopeRules: ['Assets'],
    },
  );

  assert.equal(result.unityResult?.bindingCount, 0);
  assert.ok(result.unityResult?.diagnostics.some((message) => message.includes('scanContext:')));
});
