import { describe, it, expect } from 'vitest';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findGuidHits } from './resource-hit-scanner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity');

it('findGuidHits returns resource hits for matching MonoBehaviour scripts', async () => {
  const hits = await findGuidHits(fixtureRoot, 'a6d481d58c0b4f646b7106ceaf633d6e');
  expect(hits.length).toBe(1);
  expect(hits[0].resourceType).toBe('scene');
  expect(hits[0].resourcePath).toBe('Assets/Scene/Global.unity');
  expect(hits[0].line).toBe(9);
});

it('findGuidHits includes ScriptableObject .asset resources', async () => {
  const hits = await findGuidHits(fixtureRoot, 'abababababababababababababababab');
  expect(hits.length).toBe(1);
  expect(hits[0].resourceType).toBe('asset');
  expect(hits[0].resourcePath).toBe('Assets/Config/U2ScriptableConfig.asset');
});
