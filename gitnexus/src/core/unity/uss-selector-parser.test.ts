import { describe, it, expect } from 'vitest';

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUssSelectors } from './uss-selector-parser.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity-ui');

it('extracts uss selectors with line evidence', async () => {
  const source = await fs.readFile(
    path.join(fixtureRoot, 'Assets/UI/Styles/EliteBossScreenNew.uss'),
    'utf-8',
  );
  const selectors = parseUssSelectors(source);
  expect(selectors.some((entry) => entry.selector === '.tooltip-box' && entry.line > 0)).toBe(true);
});
