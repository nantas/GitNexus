import { describe, it, expect } from 'vitest'

import { buildAnalyzeArgs, parseAnalyzeSummary } from './analyze-runner.js';

it('parseAnalyzeSummary extracts nodes/edges/time', () => {
  const sample = `
Repository indexed successfully (42.3s)
51,172 nodes | 108,578 edges | 2,545 clusters | 300 flows
`;
  const parsed = parseAnalyzeSummary(sample);
  expect(parsed.totalSeconds).toBe(42.3);
  expect(parsed.nodes).toBe(51172);
  expect(parsed.edges).toBe(108578);
});

it('buildAnalyzeArgs forwards alias and options', () => {
  const args = buildAnalyzeArgs('/repo/path', {
    extensions: '.cs,.ts',
    repoAlias: 'neonspark-v1-subset',
  });

  expect(args).toEqual([
    'dist/cli/index.js',
    'analyze',
    '--force',
    '--extensions',
    '.cs,.ts',
    '/repo/path',
    '--repo-alias',
    'neonspark-v1-subset',
  ]);
});

it('buildAnalyzeArgs omits --extensions when not explicitly provided', () => {
  const args = buildAnalyzeArgs('/repo/path', {
    repoAlias: 'neonspark-v1-subset',
  });

  expect(args.includes('--extensions')).toBe(false);
});
