import test from 'node:test';
import assert from 'node:assert/strict';
import { hasForbiddenUidHitStrict, hasRequiredHitFuzzy, resolveBenchmarkRepoName } from './runner.js';

test('resolveBenchmarkRepoName prefers explicit repo', () => {
  const resolved = resolveBenchmarkRepoName({
    repo: 'my-repo',
    repoAlias: 'alias-repo',
    targetPath: '/tmp/source',
  });
  assert.equal(resolved, 'my-repo');
});

test('resolveBenchmarkRepoName falls back to repo alias', () => {
  const resolved = resolveBenchmarkRepoName({
    repoAlias: 'neonspark-v1-subset',
    targetPath: '/tmp/source',
  });
  assert.equal(resolved, 'neonspark-v1-subset');
});

test('resolveBenchmarkRepoName uses target basename when no repo input exists', () => {
  const resolved = resolveBenchmarkRepoName({
    targetPath: '/tmp/unity-projects/neonspark',
  });
  assert.equal(resolved, 'neonspark');
});

test('hasRequiredHitFuzzy does not treat wrong same-name uid as a required hit for uid expectations', () => {
  const expected = 'Class:Assets/NEON/Code/Game/LootSystem/LootManager.cs:LootManager';
  const hitUids = ['Class:Assets/NEON/Code/Game/LootSystem/LootDropRecorder.cs:LootManager'];
  const matched = hasRequiredHitFuzzy(expected, hitUids, ['LootManager']);
  assert.equal(matched, false);
});

test('hasRequiredHitFuzzy accepts correct uid for required hit', () => {
  const expected = 'Class:Assets/NEON/Code/Game/LootSystem/LootManager.cs:LootManager';
  const hitUids = ['class:assets/neon/code/game/lootsystem/lootmanager.cs:lootmanager'];
  assert.equal(hasRequiredHitFuzzy(expected, hitUids, []), true);
});

test('hasRequiredHitFuzzy keeps legacy name fallback for non-uid expectations', () => {
  const expected = 'LootManager';
  const matched = hasRequiredHitFuzzy(expected, [], ['LootManager']);
  assert.equal(matched, true);
});

test('hasForbiddenUidHitStrict ignores same-name symbol with different uid', () => {
  const forbidden = 'Class:Assets/NEON/Code/Game/LootSystem/LootManager.cs:LootManager';
  const hitUids = ['Class:Assets/NEON/Code/Game/LootSystem/LootDropRecorder.cs:LootManager'];
  assert.equal(hasForbiddenUidHitStrict(forbidden, hitUids), false);
});

test('hasForbiddenUidHitStrict matches only exact normalized uid', () => {
  const forbidden = 'Class:Assets/NEON/Code/Game/LootSystem/LootManager.cs:LootManager';
  const hitUids = ['  class:assets/neon/code/game/lootsystem/lootmanager.cs:lootmanager  '];
  assert.equal(hasForbiddenUidHitStrict(forbidden, hitUids), true);
});
