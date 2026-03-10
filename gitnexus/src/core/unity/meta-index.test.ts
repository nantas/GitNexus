import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMetaIndex } from './meta-index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity');

test('buildMetaIndex maps script guid to script path', async () => {
  const index = await buildMetaIndex(fixtureRoot);
  assert.equal(index.get('a6d481d58c0b4f646b7106ceaf633d6e')?.endsWith('Global.cs'), true);
});
