import { describe, it, expect } from 'vitest';

import { formatLazyHydrationBudgetDiagnostic, loadUnityContext, projectUnityBindings } from './unity-enrichment.js';

it('projectUnityBindings restores graph-native Unity payload rows', () => {
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

  expect(out.resourceBindings[0].bindingKind).toBe('nested');
  expect(out.serializedFields.scalarFields.length >= 1).toBeTruthy();
  expect(out.serializedFields.referenceFields.length >= 1).toBeTruthy();
});

it('loadUnityContext queries component payload rows and projects stable output', async () => {
  const out = await loadUnityContext('repo-id', 'Class:Assets/Scripts/MainUIManager.cs:MainUIManager', async (query) => {
    expect(query).toMatch(/UNITY_COMPONENT_INSTANCE/);
    expect(query).toMatch(/UNITY_SERIALIZED_TYPE_IN/);
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

  expect(out.resourceBindings[0]?.bindingKind).toBe('scene-override');
  expect(out.serializedFields.scalarFields[0]?.name).toBe('needPause');
  expect(out.unityDiagnostics).toEqual([]);
});

it('loadUnityContext returns resourceBindings for UNITY_SERIALIZED_TYPE_IN relations', async () => {
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

  expect(out.resourceBindings.length).toBe(1);
  expect(out.resourceBindings[0]?.resourcePath).toBe('Assets/Config/Inventory.asset');
  expect(out.resourceBindings[0]?.resourceType).toBe('asset');
});

it('projectUnityBindings preserves structured assetRefPaths from payload', () => {
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

  expect(out.resourceBindings.length).toBe(1);
  expect(out.resourceBindings[0]?.assetRefPaths?.length).toBe(1);
  expect(out.resourceBindings[0]?.assetRefPaths?.[0]?.fieldName).toBe('_Head_Ref');
  expect(out.resourceBindings[0]?.assetRefPaths?.[0]?.isSprite).toBe(true);
});

it('projectUnityBindings derives assetRefPaths from serialized scalar fields when payload lacks structured rows', () => {
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
  expect(refs.length).toBe(2);
  expect(refs[0]?.fieldName).toBe('_Head_Ref');
  expect(refs[0]?.isSprite).toBe(true);
  expect(refs[1]?.fieldName).toBe('_actorPrefabRef');
  expect(refs[1]?.isSprite).toBe(false);
});

it('projectUnityBindings preserves lightweight marker from payload', () => {
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

  expect(out.resourceBindings.length).toBe(1);
  expect(out.resourceBindings[0]?.lightweight).toBe(true);
});

it('projectUnityBindings infers lightweight marker from legacy line-* component id', () => {
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

  expect(out.resourceBindings.length).toBe(1);
  expect(out.resourceBindings[0]?.lightweight).toBe(true);
});

it('projectUnityBindings restores compact component payload rows without embedded resourcePath', () => {
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

  expect(out.resourceBindings.length).toBe(1);
  expect(out.resourceBindings[0]?.resourcePath).toBe('Assets/A.prefab');
  expect(out.resourceBindings[0]?.bindingKind).toBe('direct');
  expect(out.unityDiagnostics).toEqual([]);
});

it('loadUnityContext can project UNITY_RESOURCE_SUMMARY rows before hydration', async () => {
  const out = await loadUnityContext('repo-id', 'Class:Assets/Scripts/DoorObj.cs:DoorObj', async () => [
    {
      relationType: 'UNITY_RESOURCE_SUMMARY',
      relationReason: JSON.stringify({ resourceType: 'prefab', bindingKinds: ['direct'], lightweight: true }),
      resourcePath: 'Assets/Doors/Door.prefab',
      payload: '',
    },
  ] as any);
  expect(out.resourceBindings.length).toBe(1);
  expect(out.resourceBindings[0]?.resourcePath).toBe('Assets/Doors/Door.prefab');
  expect(out.resourceBindings[0]?.lightweight).toBe(true);
});

it('formatLazyHydrationBudgetDiagnostic returns stable budget warning', () => {
  const message = formatLazyHydrationBudgetDiagnostic(17);
  expect(message).toMatch(/budget exceeded/i);
  expect(message).toMatch(/17ms/);
});
