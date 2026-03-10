import test from 'node:test';
import assert from 'node:assert/strict';
import { loadE2EConfig } from './config.js';

test('loadE2EConfig reads estimate range and 5 symbol scenarios', async () => {
  const config = await loadE2EConfig('benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json');
  assert.equal(config.estimateRangeSec.lower, 322.6);
  assert.equal(config.estimateRangeSec.upper, 540.1);
  assert.equal(config.symbolScenarios.length, 5);
  assert.deepEqual(
    config.symbolScenarios.map((s) => s.symbol),
    ['MainUIManager', 'CoinPowerUp', 'GlobalDataAssets', 'AssetRef', 'PlayerActor'],
  );
});

test('loadE2EConfig applies env overrides for real-repo gate', async () => {
  const config = await loadE2EConfig(
    'benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json',
    {
      GITNEXUS_U2_E2E_TARGET_PATH: '/tmp/unity-repo',
      GITNEXUS_U2_E2E_RUN_ID_PREFIX: 'nightly-u3-real',
      GITNEXUS_U2_E2E_REPO_ALIAS_PREFIX: 'neonspark-nightly',
      GITNEXUS_U2_E2E_ESTIMATE_LOWER_SEC: '10.5',
      GITNEXUS_U2_E2E_ESTIMATE_UPPER_SEC: '20.5',
    },
  );

  assert.equal(config.targetPath, '/tmp/unity-repo');
  assert.equal(config.runIdPrefix, 'nightly-u3-real');
  assert.equal(config.repoAliasPrefix, 'neonspark-nightly');
  assert.equal(config.estimateRangeSec.lower, 10.5);
  assert.equal(config.estimateRangeSec.upper, 20.5);
});

test('loadE2EConfig rejects half-configured estimate override', async () => {
  await assert.rejects(
    loadE2EConfig(
      'benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json',
      {
        GITNEXUS_U2_E2E_ESTIMATE_LOWER_SEC: '10.5',
      },
    ),
    /must be set together/,
  );
});
