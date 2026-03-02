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

test('buildSymbolRows supports ranged selected uid counts', () => {
  const c = [
    { symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 },
    { symbol_uid: 'u2', file_path: 'Assets/NEON/Code/B.cs', symbol_name: 'B', symbol_type: 'Class', start_line: 1, end_line: 9 },
  ];
  const ids = [...Array(40)].map((_, i) => i < 39 ? 'u1' : 'u2');
  const rows = buildSymbolRows(c as any[], ids, { minSelected: 40, maxSelected: 60 });
  assert.equal(rows.length, 40);
});

test('buildSymbolRows rejects selection below minSelected', () => {
  const c = [{ symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 }];
  const ids = [...Array(39)].map(() => 'u1');
  assert.throws(() => buildSymbolRows(c as any[], ids, { minSelected: 40, maxSelected: 60 }), /between 40 and 60/i);
});

test('buildSymbolRows rejects selection above maxSelected', () => {
  const c = [{ symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 }];
  const ids = [...Array(61)].map(() => 'u1');
  assert.throws(() => buildSymbolRows(c as any[], ids, { minSelected: 40, maxSelected: 60 }), /between 40 and 60/i);
});

test('buildSymbolRows rejects minSelected greater than maxSelected', () => {
  const c = [{ symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 }];
  const ids = [...Array(40)].map(() => 'u1');
  assert.throws(() => buildSymbolRows(c as any[], ids, { minSelected: 60, maxSelected: 40 }), /invalid selected symbol range/i);
});

test('buildSymbolRows still validates selected uid existence when range options are used', () => {
  const c = [{ symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 }];
  const ids = [...Array(40)].map((_, i) => i < 39 ? 'u1' : 'missing');
  assert.throws(
    () => buildSymbolRows(c as any[], ids, { minSelected: 40, maxSelected: 60 }),
    /selected uid not found in candidates: missing/i,
  );
});

test('buildSymbolRows validates minSelected and maxSelected as finite non-negative integers', () => {
  const c = [{ symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 }];
  const ids = [...Array(40)].map(() => 'u1');

  assert.throws(() => buildSymbolRows(c as any[], ids, { minSelected: -1, maxSelected: 60 }), /non-negative integer/i);
  assert.throws(() => buildSymbolRows(c as any[], ids, { minSelected: 40.5, maxSelected: 60 }), /non-negative integer/i);
  assert.throws(() => buildSymbolRows(c as any[], ids, { minSelected: 40, maxSelected: Number.POSITIVE_INFINITY }), /finite/i);
});
