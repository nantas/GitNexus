import { describe, it, expect } from 'vitest'

import {
  formatFallbackSummary,
  formatUnityDiagnosticsSummary,
  formatUnityRuleBindingSummary,
  resolveFallbackStats,
} from './analyze-summary.js';

it('formatUnityDiagnosticsSummary returns empty when diagnostics are missing', () => {
  const lines = formatUnityDiagnosticsSummary([]);
  expect(lines).toEqual([]);
});

it('formatUnityDiagnosticsSummary renders diagnostics with count and bullets', () => {
  const lines = formatUnityDiagnosticsSummary([
    'scanContext: scripts=4, guids=4, resources=0',
  ]);

  expect(lines).toEqual([
    'Unity Diagnostics: 1 message(s)',
    '- scanContext: scripts=4, guids=4, resources=0',
  ]);
});

it('formatUnityDiagnosticsSummary truncates output after max preview items', () => {
  const lines = formatUnityDiagnosticsSummary([
    'diag-a',
    'diag-b',
    'diag-c',
    'diag-d',
  ]);

  expect(lines).toEqual([
    'Unity Diagnostics: 4 message(s)',
    '- diag-a',
    '- diag-b',
    '- diag-c',
    '... 1 more',
  ]);
});

it('formatUnityRuleBindingSummary returns empty (functionality removed)', () => {
  expect(formatUnityRuleBindingSummary(undefined)).toEqual([]);
});

it('formatFallbackSummary returns empty when no warnings exist', () => {
  const lines = formatFallbackSummary([], {
    attempted: 0,
    succeeded: 0,
    failed: 0,
  });
  expect(lines).toEqual([]);
});

it('formatFallbackSummary renders attempted/succeeded/failed with warning preview', () => {
  const lines = formatFallbackSummary(
    [
      'Method->Delegate (1233 edges): missing rel pair in schema',
      'Class->Property (200 edges): missing rel pair in schema',
      'Constructor->Property (97 edges): missing rel pair in schema',
      'Function->Property (17 edges): missing rel pair in schema',
    ],
    {
      attempted: 1547,
      succeeded: 0,
      failed: 1547,
    },
    3,
  );

  expect(lines).toEqual([
    'Fallback edges: attempted=1547, succeeded=0, failed=1547, pairTypes=4',
    '- Method->Delegate (1233 edges): missing rel pair in schema',
    '- Class->Property (200 edges): missing rel pair in schema',
    '- Constructor->Property (97 edges): missing rel pair in schema',
    '... 1 more',
  ]);
});

it('resolveFallbackStats prefers runtime fallback insert stats when available', () => {
  expect(resolveFallbackStats(
      ['Class->File (12 edges): missing rel pair in schema'],
      { attempted: 12, succeeded: 3, failed: 9 },
    )).toEqual({ attempted: 12, succeeded: 3, failed: 9 },);
});

it('resolveFallbackStats derives attempted/failed from warnings when runtime stats are missing', () => {
  expect(resolveFallbackStats(['Class->File (7 edges): missing rel pair in schema'], undefined)).toEqual({ attempted: 7, succeeded: 0, failed: 7 },);
});
