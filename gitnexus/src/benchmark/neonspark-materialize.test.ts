import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSymbolRows } from './neonspark-materialize.js';

test('buildSymbolRows enforces exactly 20 selected uids', () => {
  const candidates = [{ symbol_uid: 'a' }];
  assert.throws(() => buildSymbolRows(candidates as any[], ['a']), /exactly 20/i);
});

test('buildSymbolRows maps selected uids to candidate rows', () => {
  const c = [
    { symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 },
    { symbol_uid: 'u2', file_path: 'Assets/NEON/Code/B.cs', symbol_name: 'B', symbol_type: 'Class', start_line: 1, end_line: 9 },
  ];
  const ids = [...Array(20)].map((_, i) => i < 19 ? 'u1' : 'u2');
  const rows = buildSymbolRows(c as any[], ids);
  assert.equal(rows.length, 20);
});
