import { describe, it, expect, vi } from 'vitest';

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUnityScanContext } from './scan-context.js';
import { extractAssetRefPathReferences, hasCoverage, resolveUnityBindings } from './resolver.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity');
const requiredSamples = ['Global', 'BattleMode', 'PlayerActor', 'MainUIManager'];
const acceptanceBaseline: Record<
  string,
  {
    expectedBindingKinds: string[];
    minScalarFields: number;
    minReferenceFields: number;
    requiredScalarFields: string[];
    requiredReferenceFields: string[];
  }
> = {
  Global: {
    expectedBindingKinds: ['direct'],
    minScalarFields: 1,
    minReferenceFields: 0,
    requiredScalarFields: ['needPause'],
    requiredReferenceFields: [],
  },
  BattleMode: {
    expectedBindingKinds: ['direct'],
    minScalarFields: 1,
    minReferenceFields: 1,
    requiredScalarFields: ['battleState'],
    requiredReferenceFields: ['uiDocument'],
  },
  PlayerActor: {
    expectedBindingKinds: ['direct'],
    minScalarFields: 1,
    minReferenceFields: 1,
    requiredScalarFields: ['walkSpeed'],
    requiredReferenceFields: ['animatorController'],
  },
  MainUIManager: {
    expectedBindingKinds: ['scene-override'],
    minScalarFields: 1,
    minReferenceFields: 1,
    requiredScalarFields: ['needPause'],
    requiredReferenceFields: ['mainUIDocument'],
  },
};

it('resolveUnityBindings matches frozen acceptance baseline for required Unity samples', async () => {
  const results = await Promise.all(
    requiredSamples.map((symbol) => resolveUnityBindings({ repoRoot: fixtureRoot, symbol })),
  );

  for (const result of results) {
    const baseline = acceptanceBaseline[result.symbol];
    expect(baseline).toBeTruthy();

    const bindingKinds = Array.from(new Set(result.resourceBindings.map((binding) => binding.bindingKind))).sort();
    expect(result.resourceBindings.length >= 1).toBeTruthy();
    expect(bindingKinds).toEqual([...baseline.expectedBindingKinds].sort());
    expect(result.serializedFields.scalarFields.length >= baseline.minScalarFields).toBeTruthy();
    expect(result.serializedFields.referenceFields.length >= baseline.minReferenceFields).toBeTruthy();

    const scalarNames = new Set(result.serializedFields.scalarFields.map((field) => field.name));
    const referenceNames = new Set(result.serializedFields.referenceFields.map((field) => field.name));
    for (const fieldName of baseline.requiredScalarFields) {
      expect(scalarNames.has(fieldName)).toBeTruthy();
    }
    for (const fieldName of baseline.requiredReferenceFields) {
      expect(referenceNames.has(fieldName)).toBeTruthy();
    }
  }

  expect(hasCoverage(results)).toEqual({ hasScalar: true, hasReference: true });
});

it('resolveUnityBindings applies PrefabInstance modifications for stripped scene components', async () => {
  const result = await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'MainUIManager' });
  const needPause = result.serializedFields.scalarFields.find((field) => field.name === 'needPause');
  const uiDocument = result.serializedFields.referenceFields.find((field) => field.name === 'mainUIDocument');

  expect(result.resourceBindings[0]?.bindingKind).toBe('scene-override');
  expect(needPause?.value).toBe('1');
  expect(needPause?.sourceLayer).toBe('scene');
  expect(uiDocument?.guid).toBe('44444444444444444444444444444444');
  expect(uiDocument?.sourceLayer).toBe('scene');
});

it('resolveUnityBindings uses provided scan context without repo re-scan', async () => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  const result = await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'MainUIManager', scanContext: context });
  expect(result.resourceBindings.length > 0).toBeTruthy();
});

it('resource YAML parse is reused across symbols sharing same resource file', async () => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  const scriptPath = context.symbolToScriptPath.get('Global');
  expect(scriptPath).toBeTruthy();

  context.symbolToScriptPath.set('GlobalAlias', scriptPath);
  const scriptGuid = context.scriptPathToGuid.get(scriptPath);
  expect(scriptGuid).toBeTruthy();
  const targetResourcePath = context.guidToResourceHits.get(scriptGuid)?.[0]?.resourcePath;
  expect(targetResourcePath).toBeTruthy();

  const originalReadFile = fs.readFile;
  let targetResourceReadCount = 0;

  vi.spyOn(fs, 'readFile').mockImplementation(async (...args: any[]) => {
    const fileArg = args[0];
    const rawPath = typeof fileArg === 'string' ? fileArg : fileArg instanceof URL ? fileArg.pathname : String(fileArg);
    const normalizedPath = rawPath.replace(/\\/g, '/');
    if (normalizedPath.endsWith(targetResourcePath)) {
      targetResourceReadCount += 1;
    }
    return originalReadFile(args[0], args[1]);
  });

  const first = await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'Global', scanContext: context });
  const second = await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'GlobalAlias', scanContext: context });

  expect(first.resourceBindings.length > 0).toBeTruthy();
  expect(second.resourceBindings.length > 0).toBeTruthy();
  expect(targetResourceReadCount).toBe(1);
});

it('resolveUnityBindings emits structured local/list reference targets for agent consumption', async () => {
  const result = await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'MenuScreenCarrier' });
  const binding = result.resourceBindings[0];
  expect(binding).toBeTruthy();

  const defaultRef = binding.resolvedReferences.find((ref) => ref.fieldName === 'defaultScreen' && !ref.fromList);
  expect(defaultRef?.resolution).toBe('local-object');
  expect(defaultRef?.target?.objectType).toBe('GameObject');
  expect(defaultRef?.target?.gameObjectName).toBe('ScreenA');

  const listRefs = binding.resolvedReferences
    .filter((ref) => ref.fieldName === 'menuScreenList' && ref.fromList)
    .sort((left, right) => (left.listIndex || 0) - (right.listIndex || 0));
  expect(listRefs.length).toBe(3);
  expect(listRefs[0].resolution).toBe('local-object');
  expect(listRefs[0].target?.gameObjectName).toBe('ScreenA');
  expect(listRefs[1].resolution).toBe('local-object');
  expect(listRefs[1].target?.gameObjectName).toBe('ScreenB');
  expect(listRefs[2].resolution).toBe('null');
});

it('resolveUnityBindings resolves external guid to asset path when scan context includes asset meta', async () => {
  const context = await buildUnityScanContext({
    repoRoot: fixtureRoot,
    scopedPaths: [
      'Assets/Scripts/MainUIManager.cs',
      'Assets/Scripts/MainUIManager.cs.meta',
      'Assets/Scene/MainUIManager.unity',
      'Assets/Config/MainUIDocument.asset.meta',
    ],
  });
  const result = await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'MainUIManager', scanContext: context });
  const mainBinding = result.resourceBindings[0];
  expect(mainBinding).toBeTruthy();

  const externalRef = mainBinding.resolvedReferences.find(
    (ref) => ref.fieldName === 'mainUIDocument' && ref.guid === '44444444444444444444444444444444',
  );
  expect(externalRef?.resolution).toBe('external-asset');
  expect(externalRef?.target?.assetPath).toBe('Assets/Config/MainUIDocument.asset');
});

it('resolveUnityBindings supports ScriptableObject .asset resource bindings', async () => {
  const context = await buildUnityScanContext({
    repoRoot: fixtureRoot,
    scopedPaths: [
      'Assets/Scripts/U2ScriptableConfig.cs',
      'Assets/Scripts/U2ScriptableConfig.cs.meta',
      'Assets/Config/U2ScriptableConfig.asset',
      'Assets/Config/U2ScriptableConfig.asset.meta',
      'Assets/Config/MainUIDocument.asset.meta',
    ],
  });
  const result = await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'U2ScriptableConfig', scanContext: context });
  const binding = result.resourceBindings[0];
  expect(binding).toBeTruthy();
  expect(binding.resourceType).toBe('asset');
  expect(binding.resourcePath).toBe('Assets/Config/U2ScriptableConfig.asset');
  expect(binding.serializedFields).toEqual(result.serializedFields);
  expect(binding.serializedFields.scalarFields.map((field) => field.name)).toEqual(['menuScreenList'],);
  expect(binding.serializedFields.referenceFields.map((field) => field.name)).toEqual(['mainUIDocument'],);
  expect(binding.serializedFields.referenceFields[0]?.sourceLayer).toBe('asset');

  const directExternal = binding.resolvedReferences.find(
    (ref) => ref.fieldName === 'mainUIDocument' && !ref.fromList,
  );
  expect(directExternal?.resolution).toBe('external-asset');
  expect(directExternal?.target?.assetPath).toBe('Assets/Config/MainUIDocument.asset');

  const listRefs = binding.resolvedReferences
    .filter((ref) => ref.fieldName === 'menuScreenList' && ref.fromList)
    .sort((left, right) => (left.listIndex || 0) - (right.listIndex || 0));
  expect(listRefs.length).toBe(2);
  expect(listRefs[0]?.resolution).toBe('null');
  expect(listRefs[1]?.resolution).toBe('external-asset');
});

it('resolveUnityBindings keeps existing scene serializedFields stable when .asset support is enabled', async () => {
  const context = await buildUnityScanContext({
    repoRoot: fixtureRoot,
    scopedPaths: [
      'Assets/Scripts/MainUIManager.cs',
      'Assets/Scripts/MainUIManager.cs.meta',
      'Assets/Scene/MainUIManager.unity',
      'Assets/Scripts/U2ScriptableConfig.cs',
      'Assets/Scripts/U2ScriptableConfig.cs.meta',
      'Assets/Config/U2ScriptableConfig.asset',
      'Assets/Config/U2ScriptableConfig.asset.meta',
      'Assets/Config/MainUIDocument.asset.meta',
    ],
  });
  const result = await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'MainUIManager', scanContext: context });
  const needPause = result.serializedFields.scalarFields.find((field) => field.name === 'needPause');
  const mainUIDocument = result.serializedFields.referenceFields.find((field) => field.name === 'mainUIDocument');

  expect(result.resourceBindings.length > 0).toBeTruthy();
  expect(needPause?.sourceLayer).toBe('scene');
  expect(needPause?.value).toBe('1');
  expect(mainUIDocument?.sourceLayer).toBe('scene');
  expect(mainUIDocument?.guid).toBe('44444444444444444444444444444444');
});

it('resolveUnityBindings supports resourcePathAllowlist filtering', async () => {
  const result = await resolveUnityBindings({
    repoRoot: fixtureRoot,
    symbol: 'MainUIManager',
    resourcePathAllowlist: ['Assets/Scene/NonExisting.unity'],
  });
  expect(result.resourceBindings.length).toBe(0);
});

it('resolveUnityBindings deepParseLargeResources can override lightweight fallback', async () => {
  const tempRoot = await fs.mkdtemp(path.join(path.dirname(fixtureRoot), 'tmp-large-unity-'));
  const scriptsDir = path.join(tempRoot, 'Assets/Scripts');
  const sceneDir = path.join(tempRoot, 'Assets/Scene');
  await fs.mkdir(scriptsDir, { recursive: true });
  await fs.mkdir(sceneDir, { recursive: true });

  try {
    const scriptPath = 'Assets/Scripts/LargeSymbol.cs';
    const scenePath = 'Assets/Scene/LargeScene.unity';
    const scriptGuid = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const padding = '#'.repeat(600 * 1024);

    await fs.writeFile(path.join(tempRoot, scriptPath), 'public class LargeSymbol {}', 'utf-8');
    await fs.writeFile(path.join(tempRoot, `${scriptPath}.meta`), `guid: ${scriptGuid}\n`, 'utf-8');
    await fs.writeFile(
      path.join(tempRoot, scenePath),
      `--- !u!114 &11400000\nMonoBehaviour:\n  m_Script: {fileID: 11500000, guid: ${scriptGuid}, type: 3}\n  needPause: 1\n${padding}\n`,
      'utf-8',
    );

    const scanContext = await buildUnityScanContext({
      repoRoot: tempRoot,
      scopedPaths: [scriptPath, `${scriptPath}.meta`, scenePath],
      symbolDeclarations: [{ symbol: 'LargeSymbol', scriptPath }],
    });

    const lightweight = await resolveUnityBindings({
      repoRoot: tempRoot,
      symbol: 'LargeSymbol',
      scanContext,
    });
    expect(lightweight.resourceBindings[0]?.lightweight).toBe(true);

    const expanded = await resolveUnityBindings({
      repoRoot: tempRoot,
      symbol: 'LargeSymbol',
      scanContext,
      deepParseLargeResources: true,
    });
    expect(expanded.resourceBindings[0]?.lightweight).toBe(undefined);
    expect(expanded.resourceBindings[0]?.componentObjectId).toBe('11400000');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

it('resolveUnityBindings matches MonoBehaviour script guid case-insensitively', async () => {
  const tempRoot = await fs.mkdtemp(path.join(path.dirname(fixtureRoot), 'tmp-guid-case-unity-'));
  const scriptsDir = path.join(tempRoot, 'Assets/Scripts');
  const assetDir = path.join(tempRoot, 'Assets/Data');
  await fs.mkdir(scriptsDir, { recursive: true });
  await fs.mkdir(assetDir, { recursive: true });

  try {
    const scriptPath = 'Assets/Scripts/CaseGuidSymbol.cs';
    const assetPath = 'Assets/Data/CaseGuid.asset';
    const scriptGuid = 'abcdefabcdefabcdefabcdefabcdefab';

    await fs.writeFile(path.join(tempRoot, scriptPath), 'public class CaseGuidSymbol {}', 'utf-8');
    await fs.writeFile(path.join(tempRoot, `${scriptPath}.meta`), `guid: ${scriptGuid}\n`, 'utf-8');
    await fs.writeFile(
      path.join(tempRoot, assetPath),
      `--- !u!114 &11400000\nMonoBehaviour:\n  m_Script: {fileID: 11500000, guid: ${scriptGuid.toUpperCase()}, type: 3}\n  value: 1\n`,
      'utf-8',
    );

    const scanContext = await buildUnityScanContext({
      repoRoot: tempRoot,
      scopedPaths: [scriptPath, `${scriptPath}.meta`, assetPath],
      symbolDeclarations: [{ symbol: 'CaseGuidSymbol', scriptPath }],
    });

    const resolved = await resolveUnityBindings({
      repoRoot: tempRoot,
      symbol: 'CaseGuidSymbol',
      scanContext,
    });

    expect(resolved.resourceBindings.length).toBe(1);
    expect(resolved.resourceBindings[0]?.resourcePath).toBe(assetPath);
    expect(resolved.unityDiagnostics.length).toBe(0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

it('resolveUnityBindings parses MonoBehaviour blocks with negative object ids', async () => {
  const tempRoot = await fs.mkdtemp(path.join(path.dirname(fixtureRoot), 'tmp-negative-object-id-'));
  const scriptsDir = path.join(tempRoot, 'Assets/Scripts');
  const assetDir = path.join(tempRoot, 'Assets/Graphs');
  await fs.mkdir(scriptsDir, { recursive: true });
  await fs.mkdir(assetDir, { recursive: true });

  try {
    const scriptPath = 'Assets/Scripts/NegativeIdSymbol.cs';
    const assetPath = 'Assets/Graphs/NegativeId.asset';
    const scriptGuid = '1b63118991a192f4d8ac217fd7fe49ce';

    await fs.writeFile(path.join(tempRoot, scriptPath), 'public class NegativeIdSymbol {}', 'utf-8');
    await fs.writeFile(path.join(tempRoot, `${scriptPath}.meta`), `guid: ${scriptGuid}\n`, 'utf-8');
    await fs.writeFile(
      path.join(tempRoot, assetPath),
      `--- !u!114 &-8618438378761226257\nMonoBehaviour:\n  m_Script: {fileID: 11500000, guid: ${scriptGuid}, type: 3}\n  m_Name: Negative Id Node\n`,
      'utf-8',
    );

    const scanContext = await buildUnityScanContext({
      repoRoot: tempRoot,
      scopedPaths: [scriptPath, `${scriptPath}.meta`, assetPath],
      symbolDeclarations: [{ symbol: 'NegativeIdSymbol', scriptPath }],
    });

    const resolved = await resolveUnityBindings({
      repoRoot: tempRoot,
      symbol: 'NegativeIdSymbol',
      scanContext,
    });

    expect(resolved.resourceBindings.length).toBe(1);
    expect(resolved.resourceBindings[0]?.resourcePath).toBe(assetPath);
    expect(resolved.unityDiagnostics.length).toBe(0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

it('extractAssetRefPathReferences parses nested _relativePath rows and marks sprite assets', () => {
  const refs = extractAssetRefPathReferences({
    scalarFields: [
      {
        name: 'Values',
        sourceLayer: 'asset',
        value: `
_Head_Ref:
  _relativePath: Assets/NEON/Art/Sprites/UI/0_pixle/ui_character_head/hero_head_Nik.png
_actorPrefabRef:
  _relativePath: Assets/ActorPrefab/Actor_Nik/V_Actor_Nik.prefab
`,
      },
    ],
    referenceFields: [],
  });

  expect(refs.length).toBe(2);
  expect(refs[0]?.fieldName).toBe('_Head_Ref');
  expect(refs[0]?.isSprite).toBe(true);
  expect(refs[1]?.fieldName).toBe('_actorPrefabRef');
  expect(refs[1]?.isSprite).toBe(false);
});

it('extractAssetRefPathReferences handles Unity Ref naming variants and stable sprite classification', () => {
  const refs = extractAssetRefPathReferences({
    scalarFields: [
      {
        name: 'Values',
        sourceLayer: 'asset',
        value: `
_icon_Ref:
  _relativePath: "Assets/NEON/Art/Sprites/UI/icon_main.PNG"
actorPrefabRef:
  _relativePath: Assets/ActorPrefab/Actor_Nik/V_Actor_Nik.prefab
_atlas_Ref:
  _relativePath: Assets/Atlas/UI.spriteatlasv2
_empty_Ref:
  _relativePath:
`,
      },
    ],
    referenceFields: [],
  });

  expect(refs.length).toBe(4);
  expect(refs[0]?.fieldName).toBe('_icon_Ref');
  expect(refs[0]?.relativePath).toBe('Assets/NEON/Art/Sprites/UI/icon_main.PNG');
  expect(refs[0]?.isSprite).toBe(true);
  expect(refs[1]?.fieldName).toBe('actorPrefabRef');
  expect(refs[1]?.isSprite).toBe(false);
  expect(refs[2]?.fieldName).toBe('_atlas_Ref');
  expect(refs[2]?.isSprite).toBe(true);
  expect(refs[3]?.fieldName).toBe('_empty_Ref');
  expect(refs[3]?.isEmpty).toBe(true);
  expect(refs.every((row) => row.parentFieldName === 'Values')).toBe(true);
});
