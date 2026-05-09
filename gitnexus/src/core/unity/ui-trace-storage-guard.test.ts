import { describe, it, expect } from 'vitest';

import { NODE_TABLES, REL_TYPES } from '../lbug/schema.js';

it('v1 ui trace does not require schema migration', () => {
  expect(NODE_TABLES.includes('Uxml' as any)).toBe(false);
  expect(NODE_TABLES.includes('Uss' as any)).toBe(false);

  expect(REL_TYPES.includes('UNITY_UI_TEMPLATE_REF' as any)).toBe(false);
  expect(REL_TYPES.includes('UNITY_UI_STYLE_REF' as any)).toBe(false);
  expect(REL_TYPES.includes('UNITY_UI_SELECTOR_BINDS' as any)).toBe(false);
});
