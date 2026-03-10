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
