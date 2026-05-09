import { describe, it, expect } from 'vitest'

import { loadE2EConfig } from './config.js';

it('loadE2EConfig reads estimate range and 5 symbol scenarios', async () => {
  const config = await loadE2EConfig('benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json');
  expect(config.estimateRangeSec.lower).toBe(322.6);
  expect(config.estimateRangeSec.upper).toBe(540.1);
  expect(config.symbolScenarios.length).toBe(5);
  expect(config.symbolScenarios.map((s) => s.symbol)).toEqual(['MainUIManager', 'CoinPowerUp', 'GlobalDataAssets', 'AssetRef', 'PlayerActor'],);
});

it('loadE2EConfig applies env overrides for real-repo gate', async () => {
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

  expect(config.targetPath).toBe('/tmp/unity-repo');
  expect(config.runIdPrefix).toBe('nightly-u3-real');
  expect(config.repoAliasPrefix).toBe('neonspark-nightly');
  expect(config.estimateRangeSec.lower).toBe(10.5);
  expect(config.estimateRangeSec.upper).toBe(20.5);
});

it('loadE2EConfig rejects half-configured estimate override', async () => {
  await expect(loadE2EConfig(
      'benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json',
      {
        GITNEXUS_U2_E2E_ESTIMATE_LOWER_SEC: '10.5',
      },
    )).rejects.toMatch(/must be set together/,);
});
