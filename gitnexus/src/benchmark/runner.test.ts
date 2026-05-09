import { describe, it, expect } from 'vitest'

import { hasForbiddenUidHitStrict, hasRequiredHitFuzzy, resolveBenchmarkRepoName } from './runner.js';

it('resolveBenchmarkRepoName prefers explicit repo', () => {
  const resolved = resolveBenchmarkRepoName({
    repo: 'my-repo',
    repoAlias: 'alias-repo',
    targetPath: '/tmp/source',
  });
  expect(resolved).toBe('my-repo');
});

it('resolveBenchmarkRepoName falls back to repo alias', () => {
  const resolved = resolveBenchmarkRepoName({
    repoAlias: 'neonspark-v1-subset',
    targetPath: '/tmp/source',
  });
  expect(resolved).toBe('neonspark-v1-subset');
});

it('resolveBenchmarkRepoName uses target basename when no repo input exists', () => {
  const resolved = resolveBenchmarkRepoName({
    targetPath: '/tmp/unity-projects/neonspark',
  });
  expect(resolved).toBe('neonspark');
});

it('hasRequiredHitFuzzy does not treat wrong same-name uid as a required hit for uid expectations', () => {
  const expected = 'Class:Assets/NEON/Code/Game/LootSystem/LootManager.cs:LootManager';
  const hitUids = ['Class:Assets/NEON/Code/Game/LootSystem/LootDropRecorder.cs:LootManager'];
  const matched = hasRequiredHitFuzzy(expected, hitUids, ['LootManager']);
  expect(matched).toBe(false);
});

it('hasRequiredHitFuzzy accepts correct uid for required hit', () => {
  const expected = 'Class:Assets/NEON/Code/Game/LootSystem/LootManager.cs:LootManager';
  const hitUids = ['class:assets/neon/code/game/lootsystem/lootmanager.cs:lootmanager'];
  expect(hasRequiredHitFuzzy(expected, hitUids, [])).toBe(true);
});

it('hasRequiredHitFuzzy keeps legacy name fallback for non-uid expectations', () => {
  const expected = 'LootManager';
  const matched = hasRequiredHitFuzzy(expected, [], ['LootManager']);
  expect(matched).toBe(true);
});

it('hasForbiddenUidHitStrict ignores same-name symbol with different uid', () => {
  const forbidden = 'Class:Assets/NEON/Code/Game/LootSystem/LootManager.cs:LootManager';
  const hitUids = ['Class:Assets/NEON/Code/Game/LootSystem/LootDropRecorder.cs:LootManager'];
  expect(hasForbiddenUidHitStrict(forbidden, hitUids)).toBe(false);
});

it('hasForbiddenUidHitStrict matches only exact normalized uid', () => {
  const forbidden = 'Class:Assets/NEON/Code/Game/LootSystem/LootManager.cs:LootManager';
  const hitUids = ['  class:assets/neon/code/game/lootsystem/lootmanager.cs:lootmanager  '];
  expect(hasForbiddenUidHitStrict(forbidden, hitUids)).toBe(true);
});
