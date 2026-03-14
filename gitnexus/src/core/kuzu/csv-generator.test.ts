import test from 'node:test';
import assert from 'node:assert/strict';
import { FileContentCache } from './csv-generator.js';

test('FileContentCache evicts oldest entries when byte budget is exceeded', async () => {
  const cache = new FileContentCache('/tmp/repo', 10);
  cache.setForTest('a.cs', '123456');
  cache.setForTest('b.cs', '123456');
  assert.equal(cache.hasForTest('a.cs'), false);
  assert.equal(cache.hasForTest('b.cs'), true);
});
