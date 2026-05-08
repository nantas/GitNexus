// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { FileContentCache, toCodeElementCsvRow } from './csv-generator.js';

test('FileContentCache evicts oldest entries when max entry count is exceeded', async () => {
  const cache = new FileContentCache('/tmp/repo', 1);
  cache.setForTest('a.cs', '123456');
  cache.setForTest('b.cs', '123456');
  assert.equal(cache.hasForTest('a.cs'), false);
  assert.equal(cache.hasForTest('b.cs'), true);
});

test('Unity component CodeElement rows store compact description and empty content', async () => {
  const row = await toCodeElementCsvRow({
    id: 'CodeElement:Assets/A.prefab:114',
    label: 'CodeElement',
    properties: {
      name: 'DoorObj@114',
      filePath: 'Assets/A.prefab',
      startLine: 12,
      endLine: 12,
      description: JSON.stringify({
        bindingKind: 'direct',
        componentObjectId: '114',
        serializedFields: { scalarFields: [], referenceFields: [] },
      }),
    },
  } as any);
  assert.match(row, /,\"\"\,\"\{/);
});
