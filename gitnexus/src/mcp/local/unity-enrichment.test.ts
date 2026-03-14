import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLazyHydrationBudgetDiagnostic, loadUnityContext, projectUnityBindings } from './unity-enrichment.js';

test('projectUnityBindings restores graph-native Unity payload rows', () => {
  const out = projectUnityBindings([
    {
      resourcePath: 'Assets/Scene/MainUIManager.unity',
      payload: JSON.stringify({
        resourcePath: 'Assets/Scene/MainUIManager.unity',
        resourceType: 'scene',
        bindingKind: 'nested',
        componentObjectId: '11400000',
        evidence: { line: 9, lineText: '  m_Script: {...}' },
        serializedFields: {
          scalarFields: [{ name: 'needPause', value: '1', valueType: 'number', sourceLayer: 'scene' }],
          referenceFields: [{ name: 'mainUIDocument', guid: 'abc', sourceLayer: 'scene' }],
        },
      }),
    },
  ]);

  assert.equal(out.resourceBindings[0].bindingKind, 'nested');
  assert.ok(out.serializedFields.scalarFields.length >= 1);
  assert.ok(out.serializedFields.referenceFields.length >= 1);
});

test('loadUnityContext queries component payload rows and projects stable output', async () => {
  const out = await loadUnityContext('repo-id', 'Class:Assets/Scripts/MainUIManager.cs:MainUIManager', async (query) => {
    assert.match(query, /UNITY_COMPONENT_INSTANCE/);
    assert.match(query, /UNITY_SERIALIZED_TYPE_IN/);
    return [
      {
        resourcePath: 'Assets/Scene/MainUIManager.unity',
        payload: JSON.stringify({
          resourcePath: 'Assets/Scene/MainUIManager.unity',
          resourceType: 'scene',
          bindingKind: 'scene-override',
          componentObjectId: '11400000',
          evidence: { line: 9, lineText: '  m_Script: {...}' },
          serializedFields: {
            scalarFields: [{ name: 'needPause', value: '1', valueType: 'number', sourceLayer: 'scene' }],
            referenceFields: [],
          },
        }),
      },
    ];
  });

  assert.equal(out.resourceBindings[0]?.bindingKind, 'scene-override');
  assert.equal(out.serializedFields.scalarFields[0]?.name, 'needPause');
  assert.deepEqual(out.unityDiagnostics, []);
});

test('loadUnityContext returns resourceBindings for UNITY_SERIALIZED_TYPE_IN relations', async () => {
  const out = await loadUnityContext('repo-id', 'Class:Assets/Scripts/AssetRef.cs:AssetRef', async () => [
    {
      relationType: 'UNITY_SERIALIZED_TYPE_IN',
      relationReason: '{"hostSymbol":"InventoryConfig","fieldName":"icon","declaredType":"AssetRef"}',
      resourcePath: 'Assets/Config/Inventory.asset',
      payload: JSON.stringify({
        resourceType: 'asset',
        serializedFields: { scalarFields: [], referenceFields: [] },
      }),
    },
  ] as any);

  assert.equal(out.resourceBindings.length, 1);
  assert.equal(out.resourceBindings[0]?.resourcePath, 'Assets/Config/Inventory.asset');
  assert.equal(out.resourceBindings[0]?.resourceType, 'asset');
});

test('projectUnityBindings preserves structured assetRefPaths from payload', () => {
  const out = projectUnityBindings([
    {
      resourcePath: 'Assets/NEON/DataAssets/CharacterList.asset',
      payload: JSON.stringify({
        resourcePath: 'Assets/NEON/DataAssets/CharacterList.asset',
        resourceType: 'asset',
        bindingKind: 'prefab-instance',
        componentObjectId: '11400000',
        assetRefPaths: [
          {
            parentFieldName: 'Values',
            fieldName: '_Head_Ref',
            relativePath: 'Assets/NEON/Art/Sprites/UI/0_pixle/ui_character_head/hero_head_Nik.png',
            sourceLayer: 'asset',
            isEmpty: false,
            isSprite: true,
          },
        ],
        serializedFields: {
          scalarFields: [],
          referenceFields: [],
        },
      }),
    },
  ]);

  assert.equal(out.resourceBindings.length, 1);
  assert.equal(out.resourceBindings[0]?.assetRefPaths?.length, 1);
  assert.equal(out.resourceBindings[0]?.assetRefPaths?.[0]?.fieldName, '_Head_Ref');
  assert.equal(out.resourceBindings[0]?.assetRefPaths?.[0]?.isSprite, true);
});

test('projectUnityBindings derives assetRefPaths from serialized scalar fields when payload lacks structured rows', () => {
  const out = projectUnityBindings([
    {
      resourcePath: 'Assets/NEON/DataAssets/CharacterList.asset',
      payload: JSON.stringify({
        resourcePath: 'Assets/NEON/DataAssets/CharacterList.asset',
        resourceType: 'asset',
        bindingKind: 'prefab-instance',
        componentObjectId: '11400000',
        serializedFields: {
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
        },
      }),
    },
  ]);

  const refs = out.resourceBindings[0]?.assetRefPaths || [];
  assert.equal(refs.length, 2);
  assert.equal(refs[0]?.fieldName, '_Head_Ref');
  assert.equal(refs[0]?.isSprite, true);
  assert.equal(refs[1]?.fieldName, '_actorPrefabRef');
  assert.equal(refs[1]?.isSprite, false);
});

test('projectUnityBindings preserves lightweight marker from payload', () => {
  const out = projectUnityBindings([
    {
      resourcePath: 'Assets/Scene/LargeScene.unity',
      payload: JSON.stringify({
        resourcePath: 'Assets/Scene/LargeScene.unity',
        resourceType: 'scene',
        bindingKind: 'direct',
        componentObjectId: 'line-200',
        lightweight: true,
        serializedFields: { scalarFields: [], referenceFields: [] },
      }),
    },
  ]);

  assert.equal(out.resourceBindings.length, 1);
  assert.equal(out.resourceBindings[0]?.lightweight, true);
});

test('projectUnityBindings infers lightweight marker from legacy line-* component id', () => {
  const out = projectUnityBindings([
    {
      resourcePath: 'Assets/Scene/LargeScene.unity',
      payload: JSON.stringify({
        resourcePath: 'Assets/Scene/LargeScene.unity',
        resourceType: 'scene',
        bindingKind: 'direct',
        componentObjectId: 'line-54558',
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
      }),
    },
  ]);

  assert.equal(out.resourceBindings.length, 1);
  assert.equal(out.resourceBindings[0]?.lightweight, true);
});

test('projectUnityBindings restores compact component payload rows without embedded resourcePath', () => {
  const out = projectUnityBindings([
    {
      resourcePath: 'Assets/A.prefab',
      payload: JSON.stringify({
        bindingKind: 'direct',
        componentObjectId: '114',
        serializedFields: { scalarFields: [], referenceFields: [] },
      }),
    },
  ]);

  assert.equal(out.resourceBindings.length, 1);
  assert.equal(out.resourceBindings[0]?.resourcePath, 'Assets/A.prefab');
  assert.equal(out.resourceBindings[0]?.bindingKind, 'direct');
  assert.deepEqual(out.unityDiagnostics, []);
});

test('loadUnityContext can project UNITY_RESOURCE_SUMMARY rows before hydration', async () => {
  const out = await loadUnityContext('repo-id', 'Class:Assets/Scripts/DoorObj.cs:DoorObj', async () => [
    {
      relationType: 'UNITY_RESOURCE_SUMMARY',
      relationReason: JSON.stringify({ resourceType: 'prefab', bindingKinds: ['direct'], lightweight: true }),
      resourcePath: 'Assets/Doors/Door.prefab',
      payload: '',
    },
  ] as any);
  assert.equal(out.resourceBindings.length, 1);
  assert.equal(out.resourceBindings[0]?.resourcePath, 'Assets/Doors/Door.prefab');
  assert.equal(out.resourceBindings[0]?.lightweight, true);
});

test('formatLazyHydrationBudgetDiagnostic returns stable budget warning', () => {
  const message = formatLazyHydrationBudgetDiagnostic(17);
  assert.match(message, /budget exceeded/i);
  assert.match(message, /17ms/);
});
