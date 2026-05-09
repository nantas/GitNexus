import { describe, it, expect } from 'vitest'

import { parseScopeRules, pathMatchesScopeRules, selectEntriesByScopeRules } from '../core/ingestion/scope-filter.js';

it('parseScopeRules ignores comments and blank lines', () => {
  const rules = parseScopeRules(`
# comment
Assets/NEON/Code

Packages/com.veewo.*
  Packages/com.neonspark.*
`);
  expect(rules).toEqual([
    'Assets/NEON/Code',
    'Packages/com.veewo.*',
    'Packages/com.neonspark.*',
  ]);
});

it('pathMatchesScopeRules supports wildcard and descendant semantics', () => {
  const rules = ['Assets/NEON/Code', 'Packages/com.veewo.*'];
  expect(pathMatchesScopeRules('Assets/NEON/Code/Game/A.cs', rules)).toBe(true);
  expect(pathMatchesScopeRules('Assets/NEON/Code', rules)).toBe(true);
  expect(pathMatchesScopeRules('Packages/com.veewo.stat/Runtime/Stat.cs', rules)).toBe(true);
  expect(pathMatchesScopeRules('Packages/com.unity.inputsystem/Runtime/X.cs', rules)).toBe(false);
});

it('selectEntriesByScopeRules reports overlap dedupe and normalized path collisions', () => {
  const entries = [
    { path: 'Assets/NEON/Code/Game/A.cs' },
    { path: 'Packages/com.veewo.stat/Runtime/Stat.cs' },
    { path: 'Packages\\com.veewo.stat\\Runtime\\Stat.cs' },
    { path: 'Packages/com.unity.inputsystem/Runtime/X.cs' },
  ];

  const result = selectEntriesByScopeRules(entries, [
    'Assets/NEON/Code',
    'Assets/NEON/*',
    'Packages/com.veewo.*',
  ]);

  expect(result.selected.length).toBe(3);
  expect(result.diagnostics.appliedRuleCount).toBe(3);
  expect(result.diagnostics.overlapFiles).toBe(1);
  expect(result.diagnostics.dedupedMatchCount).toBe(1);
  expect(result.diagnostics.normalizedCollisions.length).toBe(1);
  expect(result.diagnostics.normalizedCollisions[0]).toEqual({
    normalizedPath: 'Packages/com.veewo.stat/Runtime/Stat.cs',
    paths: [
      'Packages/com.veewo.stat/Runtime/Stat.cs',
      'Packages\\com.veewo.stat\\Runtime\\Stat.cs',
    ],
  });
});
