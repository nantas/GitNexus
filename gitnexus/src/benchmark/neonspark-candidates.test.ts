import test from 'node:test';
import assert from 'node:assert/strict';
import { filterNeonsparkPaths, parseCandidatesCliArgs, toCandidateRow } from './neonspark-candidates.js';

test('filterNeonsparkPaths keeps code and allowed package prefixes', () => {
  const rows = [
    { file_path: 'Assets/NEON/Code/Game/A.cs' },
    { file_path: 'Packages/com.veewo.stat/Runtime/Stat.cs' },
    { file_path: 'Packages/com.neonspark.inspector-navigator/Editor/NavigatorMenu.cs' },
    { file_path: 'Packages/com.unity.inputsystem/Runtime/InputAction.cs' },
  ];
  const filtered = filterNeonsparkPaths(rows as any[]);
  assert.equal(filtered.length, 3);
});

test('toCandidateRow normalizes required fields', () => {
  const row = toCandidateRow({
    symbol_uid: 'Method:Assets/NEON/Code/Game/A.cs:Tick',
    file_path: 'Assets/NEON/Code/Game/A.cs',
    symbol_name: 'Tick',
    symbol_type: 'Method',
    start_line: 11,
    end_line: 22,
  });
  assert.equal(row.symbol_name, 'Tick');
  assert.equal(row.start_line, 11);
});

test('parseCandidatesCliArgs parses repoName and outFile', () => {
  const parsed = parseCandidatesCliArgs(['neonspark-v1', '/tmp/candidates.jsonl']);
  assert.equal(parsed.repoName, 'neonspark-v1');
  assert.equal(parsed.outFile, '/tmp/candidates.jsonl');
});

test('parseCandidatesCliArgs rejects missing required args', () => {
  assert.throws(() => parseCandidatesCliArgs(['neonspark-v1']), /usage/i);
  assert.throws(() => parseCandidatesCliArgs([]), /usage/i);
});
