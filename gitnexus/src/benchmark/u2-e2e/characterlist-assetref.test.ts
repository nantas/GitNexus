import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAssetRefPathInstances,
  summarizeCharacterListAssetRefSprite,
} from './characterlist-assetref.js';

const SAMPLE_BINDING = {
  resourcePath: 'Assets/NEON/DataAssets/CharacterList.asset',
  serializedFields: {
    scalarFields: [
      {
        name: 'Values',
        value: `
_Head_Ref:
  _assetBundleName: char_head
  _relativePath: Assets/NEON/Art/Sprites/UI/0_pixle/ui_character_head/hero_head_Nik.png
_actorPrefabRef:
  _assetBundleName: char_nik_actor
  _relativePath: Assets/ActorPrefab/Actor_Nik/V_Actor_Nik.prefab
_lockedSprite_Ref:
  _assetBundleName: char_nik_portrait
  _relativePath: Assets/NEON/Art/Sprites/UI/4K/new_UI_character_choose/heroes_pic/hero_pic_nik.png
_activeSkillPowerUp_Ref:
  _assetBundleName:
  _relativePath:
`,
      },
    ],
  },
};

test('extractAssetRefPathInstances parses _relativePath rows and preserves field names', () => {
  const rows = extractAssetRefPathInstances([SAMPLE_BINDING as any]);
  assert.equal(rows.length, 4);

  const byField = new Map(rows.map((row) => [row.fieldName, row]));
  assert.equal(byField.get('_Head_Ref')?.relativePath, 'Assets/NEON/Art/Sprites/UI/0_pixle/ui_character_head/hero_head_Nik.png');
  assert.equal(byField.get('_actorPrefabRef')?.relativePath, 'Assets/ActorPrefab/Actor_Nik/V_Actor_Nik.prefab');
  assert.equal(byField.get('_lockedSprite_Ref')?.relativePath, 'Assets/NEON/Art/Sprites/UI/4K/new_UI_character_choose/heroes_pic/hero_pic_nik.png');
  assert.equal(byField.get('_activeSkillPowerUp_Ref')?.relativePath, '');
});

test('summarizeCharacterListAssetRefSprite counts non-empty and sprite instances', () => {
  const summary = summarizeCharacterListAssetRefSprite([SAMPLE_BINDING as any]);
  assert.equal(summary.extractedAssetRefInstances, 4);
  assert.equal(summary.nonEmptyAssetRefInstances, 3);
  assert.equal(summary.spriteAssetRefInstances, 2);
  assert.equal(summary.uniqueSpriteAssets, 2);
  assert.equal(summary.spriteRatioInNonEmpty, 0.6667);
});

test('summarizeCharacterListAssetRefSprite field histogram keeps only sprite fields for sprite map', () => {
  const summary = summarizeCharacterListAssetRefSprite([SAMPLE_BINDING as any]);
  assert.equal(summary.byFieldAllNonEmpty._Head_Ref, 1);
  assert.equal(summary.byFieldAllNonEmpty._actorPrefabRef, 1);
  assert.equal(summary.byFieldAllNonEmpty._lockedSprite_Ref, 1);
  assert.equal(summary.byFieldSpriteOnly._Head_Ref, 1);
  assert.equal(summary.byFieldSpriteOnly._lockedSprite_Ref, 1);
  assert.equal((summary.byFieldSpriteOnly as Record<string, number>)._actorPrefabRef, undefined);
});

test('extractAssetRefPathInstances marks sprite with extension or /Sprites/ path', () => {
  const rows = extractAssetRefPathInstances([
    {
      serializedFields: {
        scalarFields: [
          {
            value: `
_icon_Ref:
  _relativePath: Assets/Texture/icon.webp
_atlas_Ref:
  _relativePath: Assets/Atlas/UI.spriteatlasv2
_folderSprite_Ref:
  _relativePath: Assets/NEON/Art/Sprites/UI/hero_avatar
`,
          },
        ],
      },
    } as any,
  ]);

  const spriteOnly = rows.filter((row) => row.isSprite).map((row) => row.fieldName);
  assert.deepEqual(spriteOnly, ['_icon_Ref', '_atlas_Ref', '_folderSprite_Ref']);
});

test('extractAssetRefPathInstances prefers structured assetRefPaths when provided', () => {
  const rows = extractAssetRefPathInstances([
    {
      assetRefPaths: [
        {
          fieldName: '_Head_Ref',
          relativePath: 'Assets/NEON/Art/Sprites/UI/head.png',
          isEmpty: false,
          isSprite: true,
        },
        {
          fieldName: '_actorPrefabRef',
          relativePath: 'Assets/ActorPrefab/Actor_Nik/V_Actor_Nik.prefab',
          isEmpty: false,
          isSprite: false,
        },
      ],
      serializedFields: {
        scalarFields: [
          {
            value: `
_Head_Ref:
  _relativePath: Assets/THIS/SHOULD/NOT/BE/USED.png
`,
          },
        ],
      },
    } as any,
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.relativePath, 'Assets/NEON/Art/Sprites/UI/head.png');
  assert.equal(rows[1]?.relativePath, 'Assets/ActorPrefab/Actor_Nik/V_Actor_Nik.prefab');
});
