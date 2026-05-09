import { describe, it, expect } from 'vitest'

import { filterNeonsparkPaths, mainCandidatesCli, parseCandidatesCliArgs, toCandidateRow } from './neonspark-candidates.js';

it('filterNeonsparkPaths keeps code and allowed package prefixes', () => {
  const rows = [
    { file_path: 'Assets/NEON/Code/Game/A.cs' },
    { file_path: 'Packages/com.veewo.stat/Runtime/Stat.cs' },
    { file_path: 'Packages/com.neonspark.inspector-navigator/Editor/NavigatorMenu.cs' },
    { file_path: 'Packages/com.unity.inputsystem/Runtime/InputAction.cs' },
  ];
  const filtered = filterNeonsparkPaths(rows as any[]);
  expect(filtered.length).toBe(3);
});

it('toCandidateRow normalizes required fields', () => {
  const row = toCandidateRow({
    symbol_uid: 'Method:Assets/NEON/Code/Game/A.cs:Tick',
    file_path: 'Assets/NEON/Code/Game/A.cs',
    symbol_name: 'Tick',
    symbol_type: 'Method',
    start_line: 11,
    end_line: 22,
  });
  expect(row.symbol_name).toBe('Tick');
  expect(row.start_line).toBe(11);
});

it('parseCandidatesCliArgs parses repoName and outFile', () => {
  const parsed = parseCandidatesCliArgs(['neonspark-v1', '/tmp/candidates.jsonl']);
  expect(parsed.repoName).toBe('neonspark-v1');
  expect(parsed.outFile).toBe('/tmp/candidates.jsonl');
});

it('parseCandidatesCliArgs rejects missing required args', () => {
  expect(() => parseCandidatesCliArgs(['neonspark-v1'])).toThrow(/usage/i);
  expect(() => parseCandidatesCliArgs([])).toThrow(/usage/i);
});

it('mainCandidatesCli parses args and forwards to extractor', async () => {
  const calls: Array<{ repoName: string; outFile: string }> = [];
  const written = await mainCandidatesCli(
    ['neonspark-v1', '/tmp/candidates.jsonl'],
    async (repoName, outFile) => {
      calls.push({ repoName, outFile });
      return 42;
    },
  );

  expect(written).toBe(42);
  expect(calls).toEqual([{ repoName: 'neonspark-v1', outFile: '/tmp/candidates.jsonl' }]);
});
