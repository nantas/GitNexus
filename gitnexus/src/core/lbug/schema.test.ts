import { describe, it, expect } from 'vitest';

import { RELATION_SCHEMA } from './schema.js';

it('RELATION_SCHEMA includes audited fallback pairs for Property/Delegate links', () => {
  const requiredPairs = [
    'FROM Method TO `Delegate`',
    'FROM Class TO `Property`',
    'FROM Class TO File',
    'FROM `Constructor` TO `Property`',
    'FROM Function TO `Property`',
    'FROM `Property` TO Class',
    'FROM `Property` TO Interface',
    'FROM Class TO `Delegate`',
  ];

  for (const pair of requiredPairs) {
    expect(RELATION_SCHEMA).toMatch(new RegExp(pair.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')));
  }
});
