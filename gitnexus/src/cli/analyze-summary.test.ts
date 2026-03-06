import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFallbackSummary, formatUnityDiagnosticsSummary } from './analyze-summary.js';

test('formatUnityDiagnosticsSummary returns empty when diagnostics are missing', () => {
  const lines = formatUnityDiagnosticsSummary([]);
  assert.deepEqual(lines, []);
});

test('formatUnityDiagnosticsSummary renders diagnostics with count and bullets', () => {
  const lines = formatUnityDiagnosticsSummary([
    'scanContext: scripts=4, guids=4, resources=0',
  ]);

  assert.deepEqual(lines, [
    'Unity Diagnostics: 1 message(s)',
    '- scanContext: scripts=4, guids=4, resources=0',
  ]);
});

test('formatUnityDiagnosticsSummary truncates output after max preview items', () => {
  const lines = formatUnityDiagnosticsSummary([
    'diag-a',
    'diag-b',
    'diag-c',
    'diag-d',
  ]);

  assert.deepEqual(lines, [
    'Unity Diagnostics: 4 message(s)',
    '- diag-a',
    '- diag-b',
    '- diag-c',
    '... 1 more',
  ]);
});

test('formatFallbackSummary returns empty when no warnings exist', () => {
  const lines = formatFallbackSummary([], {
    attempted: 0,
    succeeded: 0,
    failed: 0,
  });
  assert.deepEqual(lines, []);
});

test('formatFallbackSummary renders attempted/succeeded/failed with warning preview', () => {
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

  assert.deepEqual(lines, [
    'Fallback edges: attempted=1547, succeeded=0, failed=1547, pairTypes=4',
    '- Method->Delegate (1233 edges): missing rel pair in schema',
    '- Class->Property (200 edges): missing rel pair in schema',
    '- Constructor->Property (97 edges): missing rel pair in schema',
    '... 1 more',
  ]);
});
