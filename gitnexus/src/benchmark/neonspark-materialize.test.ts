import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildSymbolRows, mainMaterializeCli, parseMaterializeCliArgs } from './neonspark-materialize.js';

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

test('parseMaterializeCliArgs parses positional args and default selected range', () => {
  const parsed = parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl']);
  assert.equal(parsed.candidatesFile, 'candidates.jsonl');
  assert.equal(parsed.selectedFile, 'selected.txt');
  assert.equal(parsed.outFile, 'symbols.jsonl');
  assert.equal(parsed.minSelected, 20);
  assert.equal(parsed.maxSelected, 20);
});

test('parseMaterializeCliArgs parses --min-selected and --max-selected', () => {
  const parsed = parseMaterializeCliArgs([
    'candidates.jsonl',
    'selected.txt',
    'symbols.jsonl',
    '--min-selected',
    '40',
    '--max-selected',
    '60',
  ]);
  assert.equal(parsed.minSelected, 40);
  assert.equal(parsed.maxSelected, 60);
});

test('parseMaterializeCliArgs rejects invalid CLI flags and values', () => {
  assert.throws(
    () => parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl', '--min-selected', '-1']),
    /non-negative integer/i,
  );
  assert.throws(
    () => parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl', '--max-selected']),
    /requires a value/i,
  );
  assert.throws(
    () => parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl', '--unknown', '1']),
    /unknown option/i,
  );
  assert.throws(
    () => parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl', '--min-selected', '']),
    /non-negative integer/i,
  );
  assert.throws(
    () => parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl', '--min-selected', '   ']),
    /non-negative integer/i,
  );
  assert.throws(
    () => parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl', '--min-selected', '1e2']),
    /non-negative integer/i,
  );
  assert.throws(
    () => parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl', '--min-selected', '0x10']),
    /non-negative integer/i,
  );
});

test('parseMaterializeCliArgs rejects minSelected greater than maxSelected', () => {
  assert.throws(
    () => parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl', '--min-selected', '60', '--max-selected', '40']),
    /invalid selected symbol range/i,
  );
});

test('mainMaterializeCli reads candidates and selected files and writes symbols jsonl', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'neonspark-materialize-'));
  const candidatesFile = path.join(tmp, 'candidates.jsonl');
  const selectedFile = path.join(tmp, 'selected.txt');
  const outFile = path.join(tmp, 'symbols.jsonl');

  const candidates = [
    { symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 },
    { symbol_uid: 'u2', file_path: 'Assets/NEON/Code/B.cs', symbol_name: 'B', symbol_type: 'Class', start_line: 10, end_line: 20 },
  ];

  try {
    await fs.writeFile(candidatesFile, `${JSON.stringify(candidates[0])}\n${JSON.stringify(candidates[1])}\n`, 'utf-8');
    await fs.writeFile(selectedFile, 'u2\n', 'utf-8');

    const written = await mainMaterializeCli([
      candidatesFile,
      selectedFile,
      outFile,
      '--min-selected',
      '1',
      '--max-selected',
      '2',
    ]);

    assert.equal(written, 1);
    const output = await fs.readFile(outFile, 'utf-8');
    const rows = output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    assert.equal(rows.length, 1);
    assert.equal(rows[0].symbol_uid, 'u2');
    assert.equal(rows[0].symbol_name, 'B');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
