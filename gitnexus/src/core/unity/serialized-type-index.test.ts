import { describe, it, expect } from 'vitest';

import { buildSerializableTypeIndexFromFiles, buildSerializableTypeIndexFromSources } from './serialized-type-index.js';

it('buildSerializableTypeIndex extracts serializable symbols and host field declared types', () => {
  const index = buildSerializableTypeIndexFromSources([
    {
      filePath: 'Assets/Scripts/AssetRef.cs',
      content: `
        [System.Serializable]
        public class AssetRef { public string guid; }
      `,
    },
    {
      filePath: 'Assets/Scripts/InventoryConfig.cs',
      content: `
        using UnityEngine;
        using System.Collections.Generic;
        public class InventoryConfig : ScriptableObject {
          public AssetRef icon;
          public AssetRef<GameObject> iconPrefab;
          [SerializeField] private List<AssetRef> drops;
          [SerializeField] private List<AssetRef<Sprite>> iconVariants;
          [SerializeField] private int ignored;
        }
      `,
    },
  ]);

  expect(index.serializableSymbols.has('AssetRef')).toBe(true);
  expect(index.hostFieldTypeHints.get('InventoryConfig')?.get('icon')).toBe('AssetRef');
  expect(index.hostFieldTypeHints.get('InventoryConfig')?.get('iconPrefab')).toBe('AssetRef');
  expect(index.hostFieldTypeHints.get('InventoryConfig')?.get('drops')).toBe('AssetRef');
  expect(index.hostFieldTypeHints.get('InventoryConfig')?.get('iconVariants')).toBe('AssetRef');
  expect(index.hostFieldTypeHints.get('InventoryConfig')?.has('ignored')).toBe(false);
});

it('buildSerializableTypeIndexFromFiles does not require preloaded source array', async () => {
  const out = await buildSerializableTypeIndexFromFiles([
    { filePath: 'Assets/A.cs', read: async () => '[Serializable] class AssetRef {}' },
    { filePath: 'Assets/B.cs', read: async () => 'class Host { AssetRef icon; }' },
  ] as any);
  expect(out.serializableSymbols.has('AssetRef')).toBe(true);
  expect(out.hostFieldTypeHints.get('Host')?.get('icon')).toBe('AssetRef');
});
