import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
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

test('buildUnityScanContext accepts symbol declarations as hint source', async () => {
  const context = await buildUnityScanContext({
    repoRoot: fixtureRoot,
    scopedPaths: ['Assets/Scene/MainUIManager.unity'],
    symbolDeclarations: [
      { symbol: 'HintOnly', scriptPath: 'Assets/Scripts/HintOnly.cs' },
      { symbol: 'MainUIManager', scriptPath: 'Assets/Scripts/MainUIManager.cs' },
    ],
  } as any);

  assert.equal(context.symbolToScriptPath.get('HintOnly'), 'Assets/Scripts/HintOnly.cs');
  assert.equal(context.symbolToScriptPath.get('MainUIManager'), 'Assets/Scripts/MainUIManager.cs');
});

test('buildUnityScanContext skips resource scanning when there are no script guids', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-scancontext-'));
  const badResourceDir = path.join(tempRoot, 'Assets/Scene/Broken.unity');
  await fs.mkdir(badResourceDir, { recursive: true });

  try {
    const context = await buildUnityScanContext({
      repoRoot: tempRoot,
      scopedPaths: ['Assets/Scene/Broken.unity'],
    });

    assert.equal(context.scriptPathToGuid.size, 0);
    assert.equal(context.guidToResourceHits.size, 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('buildUnityScanContext indexes scoped asset meta files for guid->path resolution', async () => {
  const context = await buildUnityScanContext({
    repoRoot: fixtureRoot,
    scopedPaths: [
      'Assets/Scripts/MainUIManager.cs',
      'Assets/Scripts/MainUIManager.cs.meta',
      'Assets/Scene/MainUIManager.unity',
      'Assets/Config/MainUIDocument.asset.meta',
    ],
  });

  assert.equal(
    context.assetGuidToPath?.get('44444444444444444444444444444444'),
    'Assets/Config/MainUIDocument.asset',
  );
});

test('buildUnityScanContext selects canonical script for duplicated symbol declarations', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-canonical-'));
  const scriptsDir = path.join(tempRoot, 'Assets/Scripts');
  const sceneDir = path.join(tempRoot, 'Assets/Scene');
  await fs.mkdir(scriptsDir, { recursive: true });
  await fs.mkdir(sceneDir, { recursive: true });

  try {
    await fs.writeFile(
      path.join(scriptsDir, 'PlayerActor.cs'),
      'public partial class PlayerActor {}',
      'utf-8',
    );
    await fs.writeFile(
      path.join(scriptsDir, 'PlayerActor.Visual.cs'),
      'public partial class PlayerActor {}',
      'utf-8',
    );
    await fs.writeFile(path.join(scriptsDir, 'PlayerActor.cs.meta'), 'guid: 11111111111111111111111111111111\n', 'utf-8');
    await fs.writeFile(path.join(scriptsDir, 'PlayerActor.Visual.cs.meta'), 'guid: 22222222222222222222222222222222\n', 'utf-8');
    await fs.writeFile(path.join(sceneDir, 'Test.unity'), '--- !u!1 &1\nguid: 11111111111111111111111111111111\n', 'utf-8');

    const context = await buildUnityScanContext({
      repoRoot: tempRoot,
      symbolDeclarations: [
        { symbol: 'PlayerActor', scriptPath: 'Assets/Scripts/PlayerActor.cs' },
        { symbol: 'PlayerActor', scriptPath: 'Assets/Scripts/PlayerActor.Visual.cs' },
      ],
    });

    assert.deepEqual(context.symbolToScriptPaths.get('PlayerActor'), [
      'Assets/Scripts/PlayerActor.cs',
      'Assets/Scripts/PlayerActor.Visual.cs',
    ]);
    assert.equal(context.symbolToCanonicalScriptPath.get('PlayerActor'), 'Assets/Scripts/PlayerActor.cs');
    assert.equal(context.symbolToScriptPath.get('PlayerActor'), 'Assets/Scripts/PlayerActor.cs');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('buildUnityScanContext exposes serializable symbol index and host field type hints', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-serializable-scancontext-'));
  const scriptsDir = path.join(tempRoot, 'Assets/Scripts');
  await fs.mkdir(scriptsDir, { recursive: true });

  try {
    await fs.writeFile(
      path.join(scriptsDir, 'AssetRef.cs'),
      `
        [System.Serializable]
        public class AssetRef { public string guid; }
      `,
      'utf-8',
    );
    await fs.writeFile(
      path.join(scriptsDir, 'InventoryConfig.cs'),
      `
        using UnityEngine;
        public class InventoryConfig : ScriptableObject {
          public AssetRef icon;
        }
      `,
      'utf-8',
    );

    const context = await buildUnityScanContext({ repoRoot: tempRoot });
    assert.equal(context.serializableSymbols.has('AssetRef'), true);
    assert.equal(context.hostFieldTypeHints.get('InventoryConfig')?.get('icon'), 'AssetRef');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
