import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUnityScanContext } from './scan-context.js';
import { resolveUnityBindings } from './resolver.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity');

test('buildUnityScanContext builds symbol/guid/hit indexes once from fixture', async () => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  assert.ok(context.symbolToScriptPath.has('MainUIManager'));
  assert.ok(context.scriptPathToGuid.size > 0);
  assert.ok(context.guidToResourceHits.size > 0);
});

test('buildUnityScanContext exposes reusable resourceDocCache for repeated resolves', async () => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  assert.equal(context.resourceDocCache.size, 0);

  await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'MainUIManager', scanContext: context });
  const cacheSizeAfterFirst = context.resourceDocCache.size;

  await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'MainUIManager', scanContext: context });
  assert.equal(context.resourceDocCache.size, cacheSizeAfterFirst);
  assert.ok(cacheSizeAfterFirst > 0);
});
