import { describe, it, expect } from 'vitest';

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildUnityScanContext, buildUnityScanContextFromSeed } from './scan-context.js';
import { resolveUnityBindings } from './resolver.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity');

it('buildUnityScanContext builds symbol/guid/hit indexes once from fixture', async () => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  expect(context.symbolToScriptPath.has('MainUIManager')).toBeTruthy();
  expect(context.scriptPathToGuid.size > 0).toBeTruthy();
  expect(context.guidToResourceHits.size > 0).toBeTruthy();
});

it('buildUnityScanContext exposes reusable resourceDocCache for repeated resolves', async () => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  expect(context.resourceDocCache.size).toBe(0);

  await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'MainUIManager', scanContext: context });
  const cacheSizeAfterFirst = context.resourceDocCache.size;

  await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'MainUIManager', scanContext: context });
  expect(context.resourceDocCache.size).toBe(cacheSizeAfterFirst);
  expect(cacheSizeAfterFirst > 0).toBeTruthy();
});

it('buildUnityScanContext exposes resourceFiles for scene/prefab scan pass', async () => {
  const context = await buildUnityScanContext({
    repoRoot: fixtureRoot,
    scopedPaths: ['Assets/Scene/MainUIManager.unity', 'Assets/Prefabs/BattleMode.prefab'],
  });

  expect(context.resourceFiles.includes('Assets/Scene/MainUIManager.unity')).toBeTruthy();
  expect(context.resourceFiles.includes('Assets/Prefabs/BattleMode.prefab')).toBeTruthy();
  expect(context.resourceFiles.includes('Assets\\Scene\\MainUIManager.unity' as any)).toBe(false);
  expect(new Set(context.resourceFiles).size).toBe(context.resourceFiles.length);
});

it('buildUnityScanContext exposes prefab-source producer from scoped unity/prefab resources', async () => {
  const context = await buildUnityScanContext({
    repoRoot: fixtureRoot,
    scopedPaths: ['Assets/Scene/MainUIManager.unity', 'Assets/Prefabs/BattleMode.prefab'],
  });

  expect(typeof (context as any).streamPrefabSourceRefs).toBe('function');
  const rows: any[] = [];
  for await (const row of (context as any).streamPrefabSourceRefs()) {
    rows.push(row);
  }
  expect(rows.length > 0).toBeTruthy();
  const sample = rows[0];
  expect(sample.fieldName).toBe('m_SourcePrefab');
  expect(sample.sourceLayer === 'scene' || sample.sourceLayer === 'prefab').toBe(true);
});

it('buildUnityScanContext keeps script-guid hits while exposing prefab-source producer', async () => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  expect(context.guidToResourceHits.size > 0).toBeTruthy();
  expect(typeof (context as any).streamPrefabSourceRefs).toBe('function');
});

it('buildUnityScanContextFromSeed rebuilds resourceFiles from guidToResourcePaths', () => {
  const context = buildUnityScanContextFromSeed({
    seed: {
      version: 1,
      symbolToScriptPath: {},
      scriptPathToGuid: {},
      guidToResourcePaths: {
        '11111111111111111111111111111111': ['Assets/Scene/MainUIManager.unity', 'Assets/Prefabs/BattleMode.prefab'],
      },
    },
  });

  expect(context.resourceFiles.sort()).toEqual([
    'Assets/Prefabs/BattleMode.prefab',
    'Assets/Scene/MainUIManager.unity',
  ]);
});

it('buildUnityScanContextFromSeed reconstructs prefabSourceRefs', () => {
  const context = buildUnityScanContextFromSeed({
    seed: {
      version: 1,
      symbolToScriptPath: {},
      scriptPathToGuid: {},
      guidToResourcePaths: {},
      prefabSourceRefs: [
        {
          sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
          targetGuid: '99999999999999999999999999999999',
          targetResourcePath: 'Assets/Prefabs/BattleMode.prefab',
          fileId: '100100000',
          fieldName: 'm_SourcePrefab',
          sourceLayer: 'scene',
        },
      ],
    } as any,
  });

  expect((context as any).prefabSourceRefs.length).toBe(1);
});

it('scan-context prefab-source producer drops unresolved and zero-guid entries', async () => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  for await (const row of (context as any).streamPrefabSourceRefs()) {
    expect(row.targetGuid).not.toBe('00000000000000000000000000000000');
    expect(String(row.targetResourcePath || '').length > 0).toBeTruthy();
  }
});

it('buildUnityScanContext accepts symbol declarations as hint source', async () => {
  const context = await buildUnityScanContext({
    repoRoot: fixtureRoot,
    scopedPaths: ['Assets/Scene/MainUIManager.unity'],
    symbolDeclarations: [
      { symbol: 'HintOnly', scriptPath: 'Assets/Scripts/HintOnly.cs' },
      { symbol: 'MainUIManager', scriptPath: 'Assets/Scripts/MainUIManager.cs' },
    ],
  } as any);

  expect(context.symbolToScriptPath.get('HintOnly')).toBe('Assets/Scripts/HintOnly.cs');
  expect(context.symbolToScriptPath.get('MainUIManager')).toBe('Assets/Scripts/MainUIManager.cs');
});

it('buildUnityScanContext skips resource scanning when there are no script guids', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-scancontext-'));
  const badResourceDir = path.join(tempRoot, 'Assets/Scene/Broken.unity');
  await fs.mkdir(badResourceDir, { recursive: true });

  try {
    const context = await buildUnityScanContext({
      repoRoot: tempRoot,
      scopedPaths: ['Assets/Scene/Broken.unity'],
    });

    expect(context.scriptPathToGuid.size).toBe(0);
    expect(context.guidToResourceHits.size).toBe(0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

it('buildUnityScanContext indexes scoped asset meta files for guid->path resolution', async () => {
  const context = await buildUnityScanContext({
    repoRoot: fixtureRoot,
    scopedPaths: [
      'Assets/Scripts/MainUIManager.cs',
      'Assets/Scripts/MainUIManager.cs.meta',
      'Assets/Scene/MainUIManager.unity',
      'Assets/Config/MainUIDocument.asset.meta',
    ],
  });

  expect(context.assetGuidToPath?.get('44444444444444444444444444444444')).toBe('Assets/Config/MainUIDocument.asset',);
});

it('buildUnityScanContext selects canonical script for duplicated symbol declarations', async () => {
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
    await fs.writeFile(
      path.join(sceneDir, 'Test.unity'),
      '--- !u!114 &1\nMonoBehaviour:\n  m_Script: {fileID: 11500000, guid: 11111111111111111111111111111111, type: 3}\n',
      'utf-8',
    );

    const context = await buildUnityScanContext({
      repoRoot: tempRoot,
      symbolDeclarations: [
        { symbol: 'PlayerActor', scriptPath: 'Assets/Scripts/PlayerActor.cs' },
        { symbol: 'PlayerActor', scriptPath: 'Assets/Scripts/PlayerActor.Visual.cs' },
      ],
    });

    expect(context.symbolToScriptPaths.get('PlayerActor')).toEqual([
      'Assets/Scripts/PlayerActor.cs',
      'Assets/Scripts/PlayerActor.Visual.cs',
    ]);
    expect(context.symbolToCanonicalScriptPath.get('PlayerActor')).toBe('Assets/Scripts/PlayerActor.cs');
    expect(context.symbolToScriptPath.get('PlayerActor')).toBe('Assets/Scripts/PlayerActor.cs');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

it('buildUnityScanContext exposes serializable symbol index and host field type hints', async () => {
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
    expect(context.serializableSymbols.has('AssetRef')).toBe(true);
    expect(context.hostFieldTypeHints.get('InventoryConfig')?.get('icon')).toBe('AssetRef');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

it('buildUnityScanContext builds serializable index from files without preloading source array', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-serializable-streaming-'));
  const scriptsDir = path.join(tempRoot, 'Assets/Scripts');
  await fs.mkdir(scriptsDir, { recursive: true });

  try {
    await fs.writeFile(path.join(scriptsDir, 'AssetRef.cs'), '[Serializable] class AssetRef {}', 'utf-8');
    await fs.writeFile(path.join(scriptsDir, 'Host.cs'), 'class Host { AssetRef icon; }', 'utf-8');

    const context = await buildUnityScanContext({ repoRoot: tempRoot });
    expect(context.serializableSymbols.has('AssetRef')).toBe(true);
    expect(context.hostFieldTypeHints.get('Host')?.get('icon')).toBe('AssetRef');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

it('buildUnityScanContextFromSeed reconstructs lookup maps for resolver fast path', async () => {
  const context = buildUnityScanContextFromSeed({
    seed: {
      version: 1,
      symbolToScriptPath: {
        MainUIManager: 'Assets/Scripts/MainUIManager.cs',
      },
      scriptPathToGuid: {
        'Assets/Scripts/MainUIManager.cs': '11111111111111111111111111111111',
      },
      guidToResourcePaths: {
        '11111111111111111111111111111111': ['Assets/Scene/MainUIManager.unity'],
      },
      assetGuidToPath: {
        '44444444444444444444444444444444': 'Assets/Config/MainUIDocument.asset',
      },
    },
    symbolDeclarations: [{ symbol: 'MainUIManager', scriptPath: 'Assets/Scripts/MainUIManager.cs' }],
  });

  expect(context.symbolToScriptPath.get('MainUIManager')).toBe('Assets/Scripts/MainUIManager.cs');
  expect(context.scriptPathToGuid.get('Assets/Scripts/MainUIManager.cs')).toBe('11111111111111111111111111111111');
  expect(context.guidToResourceHits.get('11111111111111111111111111111111')?.length).toBe(1);
  expect(context.assetGuidToPath?.get('44444444444444444444444444444444')).toBe('Assets/Config/MainUIDocument.asset');
});
