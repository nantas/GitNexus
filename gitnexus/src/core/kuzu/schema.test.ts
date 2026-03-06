import test from 'node:test';
import assert from 'node:assert/strict';
import { RELATION_SCHEMA } from './schema.js';

test('RELATION_SCHEMA includes audited fallback pairs for Property/Delegate links', () => {
  const requiredPairs = [
    'FROM Method TO `Delegate`',
    'FROM Class TO `Property`',
    'FROM `Constructor` TO `Property`',
    'FROM Function TO `Property`',
    'FROM `Property` TO Class',
    'FROM `Property` TO Interface',
    'FROM Class TO `Delegate`',
  ];

  for (const pair of requiredPairs) {
    assert.match(
      RELATION_SCHEMA,
      new RegExp(pair.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')),
      `Missing relationship pair in schema: ${pair}`,
    );
  }
});
