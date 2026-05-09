import { describe, it, expect } from 'vitest';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUnityUiMetaIndex } from './ui-meta-index.js';
import { buildUnityScanContext } from './scan-context.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity-ui');

it('builds *.uxml.meta/*.uss.meta guid indexes', async () => {
  const index = await buildUnityUiMetaIndex(fixtureRoot);
  expect(index.uxmlGuidToPath.get('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe('Assets/UI/Screens/EliteBossScreenNew.uxml',);
  expect(index.ussGuidToPath.get('dddddddddddddddddddddddddddddddd')).toBe('Assets/UI/Styles/EliteBossScreenNew.uss',);
});

it('buildUnityScanContext exposes uxml/uss guid indexes', async () => {
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  expect(context.uxmlGuidToPath?.get('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toBe('Assets/UI/Screens/DressUpScreenNew.uxml',);
  expect(context.ussGuidToPath?.get('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')).toBe('Assets/UI/Styles/DressUpScreenNew.uss',);
});
