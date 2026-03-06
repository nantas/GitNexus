import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUnityScanContext } from './scan-context.js';
import { hasCoverage, resolveUnityBindings } from './resolver.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity');
const requiredSamples = ['Global', 'BattleMode', 'PlayerActor', 'MainUIManager'];

test('resolveUnityBindings returns bindings and fields for required Unity samples', async () => {
  const results = await Promise.all(
    requiredSamples.map((symbol) => resolveUnityBindings({ repoRoot: fixtureRoot, symbol })),
  );

  for (const result of results) {
    assert.ok(result.resourceBindings.length >= 1, `${result.symbol} should have at least one resource binding`);
    assert.ok(
      result.serializedFields.scalarFields.length + result.serializedFields.referenceFields.length > 0,
      `${result.symbol} should expose serialized fields`,
    );
  }

  assert.deepEqual(hasCoverage(results), { hasScalar: true, hasReference: true });
});

test('resolveUnityBindings applies PrefabInstance modifications for stripped scene components', async () => {
  const result = await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'MainUIManager' });
  const needPause = result.serializedFields.scalarFields.find((field) => field.name === 'needPause');
  const uiDocument = result.serializedFields.referenceFields.find((field) => field.name === 'mainUIDocument');

  assert.equal(result.resourceBindings[0]?.bindingKind, 'scene-override');
  assert.equal(needPause?.value, '1');
  assert.equal(needPause?.sourceLayer, 'scene');
  assert.equal(uiDocument?.guid, '44444444444444444444444444444444');
  assert.equal(uiDocument?.sourceLayer, 'scene');
});

test('resolveUnityBindings uses provided scan context without repo re-scan', async () => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  const result = await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'MainUIManager', scanContext: context });
  assert.ok(result.resourceBindings.length > 0);
});

test('resource YAML parse is reused across symbols sharing same resource file', async (t) => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  const scriptPath = context.symbolToScriptPath.get('Global');
  assert.ok(scriptPath);

  context.symbolToScriptPath.set('GlobalAlias', scriptPath);
  const scriptGuid = context.scriptPathToGuid.get(scriptPath);
  assert.ok(scriptGuid);
  const targetResourcePath = context.guidToResourceHits.get(scriptGuid)?.[0]?.resourcePath;
  assert.ok(targetResourcePath);

  const originalReadFile = fs.readFile.bind(fs) as (...args: any[]) => Promise<string | Buffer>;
  let targetResourceReadCount = 0;

  t.mock.method(fs as any, 'readFile', async (...args: any[]) => {
    const fileArg = args[0];
    const rawPath = typeof fileArg === 'string' ? fileArg : fileArg instanceof URL ? fileArg.pathname : String(fileArg);
    const normalizedPath = rawPath.replace(/\\/g, '/');
    if (normalizedPath.endsWith(targetResourcePath)) {
      targetResourceReadCount += 1;
    }
    return originalReadFile(...args);
  });

  const first = await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'Global', scanContext: context });
  const second = await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'GlobalAlias', scanContext: context });

  assert.ok(first.resourceBindings.length > 0);
  assert.ok(second.resourceBindings.length > 0);
  assert.equal(targetResourceReadCount, 1);
});
