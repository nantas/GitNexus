import { describe, it, expect } from 'vitest'

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildSymbolRows, mainMaterializeCli, parseMaterializeCliArgs } from './neonspark-materialize.js';

it('buildSymbolRows enforces exactly 20 selected uids', () => {
  const candidates = [{ symbol_uid: 'a' }];
  expect(() => buildSymbolRows(candidates as any[], ['a'])).toThrow(/exactly 20/i);
});

it('buildSymbolRows maps selected uids to candidate rows', () => {
  const c = [
    { symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 },
    { symbol_uid: 'u2', file_path: 'Assets/NEON/Code/B.cs', symbol_name: 'B', symbol_type: 'Class', start_line: 1, end_line: 9 },
  ];
  const ids = [...Array(20)].map((_, i) => i < 19 ? 'u1' : 'u2');
  const rows = buildSymbolRows(c as any[], ids);
  expect(rows.length).toBe(20);
});

it('buildSymbolRows supports ranged selected uid counts', () => {
  const c = [
    { symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 },
    { symbol_uid: 'u2', file_path: 'Assets/NEON/Code/B.cs', symbol_name: 'B', symbol_type: 'Class', start_line: 1, end_line: 9 },
  ];
  const ids = [...Array(40)].map((_, i) => i < 39 ? 'u1' : 'u2');
  const rows = buildSymbolRows(c as any[], ids, { minSelected: 40, maxSelected: 60 });
  expect(rows.length).toBe(40);
});

it('buildSymbolRows rejects selection below minSelected', () => {
  const c = [{ symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 }];
  const ids = [...Array(39)].map(() => 'u1');
  expect(() => buildSymbolRows(c as any[], ids, { minSelected: 40, maxSelected: 60 })).toThrow(/between 40 and 60/i);
});

it('buildSymbolRows rejects selection above maxSelected', () => {
  const c = [{ symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 }];
  const ids = [...Array(61)].map(() => 'u1');
  expect(() => buildSymbolRows(c as any[], ids, { minSelected: 40, maxSelected: 60 })).toThrow(/between 40 and 60/i);
});

it('buildSymbolRows rejects minSelected greater than maxSelected', () => {
  const c = [{ symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 }];
  const ids = [...Array(40)].map(() => 'u1');
  expect(() => buildSymbolRows(c as any[], ids, { minSelected: 60, maxSelected: 40 })).toThrow(/invalid selected symbol range/i);
});

it('buildSymbolRows still validates selected uid existence when range options are used', () => {
  const c = [{ symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 }];
  const ids = [...Array(40)].map((_, i) => i < 39 ? 'u1' : 'missing');
  expect(() => buildSymbolRows(c as any[], ids, { minSelected: 40, maxSelected: 60 })).toThrow(/selected uid not found in candidates: missing/i,);
});

it('buildSymbolRows validates minSelected and maxSelected as finite non-negative integers', () => {
  const c = [{ symbol_uid: 'u1', file_path: 'Assets/NEON/Code/A.cs', symbol_name: 'A', symbol_type: 'Class', start_line: 1, end_line: 9 }];
  const ids = [...Array(40)].map(() => 'u1');

  expect(() => buildSymbolRows(c as any[], ids, { minSelected: -1, maxSelected: 60 })).toThrow(/non-negative integer/i);
  expect(() => buildSymbolRows(c as any[], ids, { minSelected: 40.5, maxSelected: 60 })).toThrow(/non-negative integer/i);
  expect(() => buildSymbolRows(c as any[], ids, { minSelected: 40, maxSelected: Number.POSITIVE_INFINITY })).toThrow(/finite/i);
});

it('parseMaterializeCliArgs parses positional args and default selected range', () => {
  const parsed = parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl']);
  expect(parsed.candidatesFile).toBe('candidates.jsonl');
  expect(parsed.selectedFile).toBe('selected.txt');
  expect(parsed.outFile).toBe('symbols.jsonl');
  expect(parsed.minSelected).toBe(20);
  expect(parsed.maxSelected).toBe(20);
});

it('parseMaterializeCliArgs parses --min-selected and --max-selected', () => {
  const parsed = parseMaterializeCliArgs([
    'candidates.jsonl',
    'selected.txt',
    'symbols.jsonl',
    '--min-selected',
    '40',
    '--max-selected',
    '60',
  ]);
  expect(parsed.minSelected).toBe(40);
  expect(parsed.maxSelected).toBe(60);
});

it('parseMaterializeCliArgs rejects invalid CLI flags and values', () => {
  expect(() => parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl', '--min-selected', '-1'])).toThrow(/non-negative integer/i,);
  expect(() => parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl', '--max-selected'])).toThrow(/requires a value/i,);
  expect(() => parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl', '--unknown', '1'])).toThrow(/unknown option/i,);
  expect(() => parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl', '--min-selected', ''])).toThrow(/non-negative integer/i,);
  expect(() => parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl', '--min-selected', '   '])).toThrow(/non-negative integer/i,);
  expect(() => parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl', '--min-selected', '1e2'])).toThrow(/non-negative integer/i,);
  expect(() => parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl', '--min-selected', '0x10'])).toThrow(/non-negative integer/i,);
});

it('parseMaterializeCliArgs rejects minSelected greater than maxSelected', () => {
  expect(() => parseMaterializeCliArgs(['candidates.jsonl', 'selected.txt', 'symbols.jsonl', '--min-selected', '60', '--max-selected', '40'])).toThrow(/invalid selected symbol range/i,);
});

it('mainMaterializeCli reads candidates and selected files and writes symbols jsonl', async () => {
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

    expect(written).toBe(1);
    const output = await fs.readFile(outFile, 'utf-8');
    const rows = output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(rows.length).toBe(1);
    expect(rows[0].symbol_uid).toBe('u2');
    expect(rows[0].symbol_name).toBe('B');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
