import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findGuidHits } from './resource-hit-scanner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity');

test('findGuidHits returns resource hits for matching MonoBehaviour scripts', async () => {
  const hits = await findGuidHits(fixtureRoot, 'a6d481d58c0b4f646b7106ceaf633d6e');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].resourceType, 'scene');
  assert.equal(hits[0].resourcePath, 'Assets/Scene/Global.unity');
  assert.equal(hits[0].line, 9);
});

test('findGuidHits includes ScriptableObject .asset resources', async () => {
  const hits = await findGuidHits(fixtureRoot, 'abababababababababababababababab');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].resourceType, 'asset');
  assert.equal(hits[0].resourcePath, 'Assets/Config/U2ScriptableConfig.asset');
});
