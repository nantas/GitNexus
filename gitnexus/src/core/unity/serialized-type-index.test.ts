import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSerializableTypeIndexFromSources } from './serialized-type-index.js';

test('buildSerializableTypeIndex extracts serializable symbols and host field declared types', () => {
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

  assert.equal(index.serializableSymbols.has('AssetRef'), true);
  assert.equal(index.hostFieldTypeHints.get('InventoryConfig')?.get('icon'), 'AssetRef');
  assert.equal(index.hostFieldTypeHints.get('InventoryConfig')?.get('iconPrefab'), 'AssetRef');
  assert.equal(index.hostFieldTypeHints.get('InventoryConfig')?.get('drops'), 'AssetRef');
  assert.equal(index.hostFieldTypeHints.get('InventoryConfig')?.get('iconVariants'), 'AssetRef');
  assert.equal(index.hostFieldTypeHints.get('InventoryConfig')?.has('ignored'), false);
});
