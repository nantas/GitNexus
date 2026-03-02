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
    targetPath: '/Volumes/Shuttle/unity-projects/neonspark',
  });
  assert.equal(resolved, 'neonspark');
});

test('hasRequiredHitFuzzy allows name-based match when uid is not present', () => {
  const expected = 'Class:Assets/NEON/Code/Game/LootSystem/LootManager.cs:LootManager';
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
