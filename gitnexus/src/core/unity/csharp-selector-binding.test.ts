import { describe, it, expect } from 'vitest';

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCsharpSelectorBindings } from './csharp-selector-binding.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity-ui');

it('extracts static-only selector bindings from csharp', async () => {
  const source = await fs.readFile(
    path.join(fixtureRoot, 'Assets/Scripts/EliteBossScreenController.cs'),
    'utf-8',
  );
  const bindings = extractCsharpSelectorBindings(source);

  expect(bindings.some((entry) => entry.className === 'tooltip-box')).toBe(true);
  expect(bindings.some((entry) => entry.isDynamic)).toBe(false);
});
