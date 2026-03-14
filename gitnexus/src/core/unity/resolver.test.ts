import test from 'node:test';
import assert from 'node:assert/strict';
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

test('resolveUnityBindings matches frozen acceptance baseline for required Unity samples', async () => {
  const results = await Promise.all(
    requiredSamples.map((symbol) => resolveUnityBindings({ repoRoot: fixtureRoot, symbol })),
  );

  for (const result of results) {
    const baseline = acceptanceBaseline[result.symbol];
    assert.ok(baseline, `Missing acceptance baseline for ${result.symbol}`);

    const bindingKinds = Array.from(new Set(result.resourceBindings.map((binding) => binding.bindingKind))).sort();
    assert.ok(result.resourceBindings.length >= 1, `${result.symbol} should have at least one resource binding`);
    assert.deepEqual(bindingKinds, [...baseline.expectedBindingKinds].sort(), `${result.symbol} binding kinds changed`);
    assert.ok(
      result.serializedFields.scalarFields.length >= baseline.minScalarFields,
      `${result.symbol} scalar field count below baseline`,
    );
    assert.ok(
      result.serializedFields.referenceFields.length >= baseline.minReferenceFields,
      `${result.symbol} reference field count below baseline`,
    );

    const scalarNames = new Set(result.serializedFields.scalarFields.map((field) => field.name));
    const referenceNames = new Set(result.serializedFields.referenceFields.map((field) => field.name));
    for (const fieldName of baseline.requiredScalarFields) {
      assert.ok(scalarNames.has(fieldName), `${result.symbol} missing scalar field ${fieldName}`);
    }
    for (const fieldName of baseline.requiredReferenceFields) {
      assert.ok(referenceNames.has(fieldName), `${result.symbol} missing reference field ${fieldName}`);
    }
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

test('resolveUnityBindings emits structured local/list reference targets for agent consumption', async () => {
  const result = await resolveUnityBindings({ repoRoot: fixtureRoot, symbol: 'MenuScreenCarrier' });
  const binding = result.resourceBindings[0];
  assert.ok(binding);

  const defaultRef = binding.resolvedReferences.find((ref) => ref.fieldName === 'defaultScreen' && !ref.fromList);
  assert.equal(defaultRef?.resolution, 'local-object');
  assert.equal(defaultRef?.target?.objectType, 'GameObject');
  assert.equal(defaultRef?.target?.gameObjectName, 'ScreenA');

  const listRefs = binding.resolvedReferences
    .filter((ref) => ref.fieldName === 'menuScreenList' && ref.fromList)
    .sort((left, right) => (left.listIndex || 0) - (right.listIndex || 0));
  assert.equal(listRefs.length, 3);
  assert.equal(listRefs[0].resolution, 'local-object');
  assert.equal(listRefs[0].target?.gameObjectName, 'ScreenA');
  assert.equal(listRefs[1].resolution, 'local-object');
  assert.equal(listRefs[1].target?.gameObjectName, 'ScreenB');
  assert.equal(listRefs[2].resolution, 'null');
});

test('resolveUnityBindings resolves external guid to asset path when scan context includes asset meta', async () => {
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
  assert.ok(mainBinding);

  const externalRef = mainBinding.resolvedReferences.find(
    (ref) => ref.fieldName === 'mainUIDocument' && ref.guid === '44444444444444444444444444444444',
  );
  assert.equal(externalRef?.resolution, 'external-asset');
  assert.equal(externalRef?.target?.assetPath, 'Assets/Config/MainUIDocument.asset');
});

test('resolveUnityBindings supports ScriptableObject .asset resource bindings', async () => {
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
  assert.ok(binding);
  assert.equal(binding.resourceType, 'asset');
  assert.equal(binding.resourcePath, 'Assets/Config/U2ScriptableConfig.asset');
  assert.deepEqual(binding.serializedFields, result.serializedFields);
  assert.deepEqual(
    binding.serializedFields.scalarFields.map((field) => field.name),
    ['menuScreenList'],
  );
  assert.deepEqual(
    binding.serializedFields.referenceFields.map((field) => field.name),
    ['mainUIDocument'],
  );
  assert.equal(binding.serializedFields.referenceFields[0]?.sourceLayer, 'asset');

  const directExternal = binding.resolvedReferences.find(
    (ref) => ref.fieldName === 'mainUIDocument' && !ref.fromList,
  );
  assert.equal(directExternal?.resolution, 'external-asset');
  assert.equal(directExternal?.target?.assetPath, 'Assets/Config/MainUIDocument.asset');

  const listRefs = binding.resolvedReferences
    .filter((ref) => ref.fieldName === 'menuScreenList' && ref.fromList)
    .sort((left, right) => (left.listIndex || 0) - (right.listIndex || 0));
  assert.equal(listRefs.length, 2);
  assert.equal(listRefs[0]?.resolution, 'null');
  assert.equal(listRefs[1]?.resolution, 'external-asset');
});

test('resolveUnityBindings keeps existing scene serializedFields stable when .asset support is enabled', async () => {
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

  assert.ok(result.resourceBindings.length > 0);
  assert.equal(needPause?.sourceLayer, 'scene');
  assert.equal(needPause?.value, '1');
  assert.equal(mainUIDocument?.sourceLayer, 'scene');
  assert.equal(mainUIDocument?.guid, '44444444444444444444444444444444');
});

test('resolveUnityBindings supports resourcePathAllowlist filtering', async () => {
  const result = await resolveUnityBindings({
    repoRoot: fixtureRoot,
    symbol: 'MainUIManager',
    resourcePathAllowlist: ['Assets/Scene/NonExisting.unity'],
  });
  assert.equal(result.resourceBindings.length, 0);
});

test('resolveUnityBindings deepParseLargeResources can override lightweight fallback', async () => {
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
    assert.equal(lightweight.resourceBindings[0]?.lightweight, true);

    const expanded = await resolveUnityBindings({
      repoRoot: tempRoot,
      symbol: 'LargeSymbol',
      scanContext,
      deepParseLargeResources: true,
    });
    assert.equal(expanded.resourceBindings[0]?.lightweight, undefined);
    assert.equal(expanded.resourceBindings[0]?.componentObjectId, '11400000');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('extractAssetRefPathReferences parses nested _relativePath rows and marks sprite assets', () => {
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

  assert.equal(refs.length, 2);
  assert.equal(refs[0]?.fieldName, '_Head_Ref');
  assert.equal(refs[0]?.isSprite, true);
  assert.equal(refs[1]?.fieldName, '_actorPrefabRef');
  assert.equal(refs[1]?.isSprite, false);
});

test('extractAssetRefPathReferences handles Unity Ref naming variants and stable sprite classification', () => {
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

  assert.equal(refs.length, 4);
  assert.equal(refs[0]?.fieldName, '_icon_Ref');
  assert.equal(refs[0]?.relativePath, 'Assets/NEON/Art/Sprites/UI/icon_main.PNG');
  assert.equal(refs[0]?.isSprite, true);
  assert.equal(refs[1]?.fieldName, 'actorPrefabRef');
  assert.equal(refs[1]?.isSprite, false);
  assert.equal(refs[2]?.fieldName, '_atlas_Ref');
  assert.equal(refs[2]?.isSprite, true);
  assert.equal(refs[3]?.fieldName, '_empty_Ref');
  assert.equal(refs[3]?.isEmpty, true);
  assert.equal(refs.every((row) => row.parentFieldName === 'Values'), true);
});
