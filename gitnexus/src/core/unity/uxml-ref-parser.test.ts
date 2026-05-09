import { describe, it, expect } from 'vitest';

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUxmlRefs } from './uxml-ref-parser.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity-ui');

it('extracts uxml template/style refs with line evidence', async () => {
  const source = await fs.readFile(
    path.join(fixtureRoot, 'Assets/UI/Screens/EliteBossScreenNew.uxml'),
    'utf-8',
  );
  const out = parseUxmlRefs(source);

  expect(out.templates.length > 0).toBe(true);
  expect(out.styles.length > 0).toBe(true);
  expect(out.templates[0].guid).toBe('cccccccccccccccccccccccccccccccc');
  expect(out.styles[0].guid).toBe('dddddddddddddddddddddddddddddddd');
  expect(out.templates[0].line > 0).toBe(true);
  expect(out.styles[0].line > 0).toBe(true);
});

it('supports namespaced ui:Template and ui:Style tags', () => {
  const source = [
    '<ui:UXML xmlns:ui="UnityEngine.UIElements">',
    '  <ui:Style src="project://database/Assets/UI/Styles/A.uss?guid=11111111111111111111111111111111&amp;type=3" />',
    '  <ui:Template src="project://database/Assets/UI/Components/B.uxml?guid=22222222222222222222222222222222&amp;type=3" />',
    '</ui:UXML>',
  ].join('\n');
  const out = parseUxmlRefs(source);
  expect(out.styles.length).toBe(1);
  expect(out.templates.length).toBe(1);
  expect(out.styles[0].guid).toBe('11111111111111111111111111111111');
  expect(out.templates[0].guid).toBe('22222222222222222222222222222222');
});
