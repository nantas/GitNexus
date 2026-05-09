import { describe, it, expect } from 'vitest'

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

it('extractAssetRefPathInstances parses _relativePath rows and preserves field names', () => {
  const rows = extractAssetRefPathInstances([SAMPLE_BINDING as any]);
  expect(rows.length).toBe(4);

  const byField = new Map(rows.map((row) => [row.fieldName, row]));
  expect(byField.get('_Head_Ref')?.relativePath).toBe('Assets/NEON/Art/Sprites/UI/0_pixle/ui_character_head/hero_head_Nik.png');
  expect(byField.get('_actorPrefabRef')?.relativePath).toBe('Assets/ActorPrefab/Actor_Nik/V_Actor_Nik.prefab');
  expect(byField.get('_lockedSprite_Ref')?.relativePath).toBe('Assets/NEON/Art/Sprites/UI/4K/new_UI_character_choose/heroes_pic/hero_pic_nik.png');
  expect(byField.get('_activeSkillPowerUp_Ref')?.relativePath).toBe('');
});

it('summarizeCharacterListAssetRefSprite counts non-empty and sprite instances', () => {
  const summary = summarizeCharacterListAssetRefSprite([SAMPLE_BINDING as any]);
  expect(summary.extractedAssetRefInstances).toBe(4);
  expect(summary.nonEmptyAssetRefInstances).toBe(3);
  expect(summary.spriteAssetRefInstances).toBe(2);
  expect(summary.uniqueSpriteAssets).toBe(2);
  expect(summary.spriteRatioInNonEmpty).toBe(0.6667);
});

it('summarizeCharacterListAssetRefSprite field histogram keeps only sprite fields for sprite map', () => {
  const summary = summarizeCharacterListAssetRefSprite([SAMPLE_BINDING as any]);
  expect(summary.byFieldAllNonEmpty._Head_Ref).toBe(1);
  expect(summary.byFieldAllNonEmpty._actorPrefabRef).toBe(1);
  expect(summary.byFieldAllNonEmpty._lockedSprite_Ref).toBe(1);
  expect(summary.byFieldSpriteOnly._Head_Ref).toBe(1);
  expect(summary.byFieldSpriteOnly._lockedSprite_Ref).toBe(1);
  expect((summary.byFieldSpriteOnly as Record<string, number>)._actorPrefabRef).toBe(undefined);
});

it('extractAssetRefPathInstances marks sprite with extension or /Sprites/ path', () => {
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
  expect(spriteOnly).toEqual(['_icon_Ref', '_atlas_Ref', '_folderSprite_Ref']);
});

it('extractAssetRefPathInstances prefers structured assetRefPaths when provided', () => {
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

  expect(rows.length).toBe(2);
  expect(rows[0]?.relativePath).toBe('Assets/NEON/Art/Sprites/UI/head.png');
  expect(rows[1]?.relativePath).toBe('Assets/ActorPrefab/Actor_Nik/V_Actor_Nik.prefab');
});
