import test from 'node:test';
import assert from 'node:assert/strict';
import { runUnityLazyContextSampler } from './unity-lazy-context-sampler.js';

test('sampler emits cold/warm latency and rss metrics with threshold verdict', async () => {
  const fakeRunner = async ({ warm }: { warm: boolean }) => ({
    durationMs: warm ? 420 : 6200,
    maxRssBytes: warm ? 650 * 1024 * 1024 : 1700 * 1024 * 1024,
    exitCode: 0,
    stdout: '',
    stderr: '',
  });

  const report = await runUnityLazyContextSampler(fakeRunner as any, {
    targetPath: '/tmp/repo',
    repo: 'neonnew-core',
    symbol: 'DoorObj',
    file: 'Assets/NEON/Code/Game/Doors/DoorObj.cs',
    thresholds: {
      coldMsMax: 7000,
      warmMsMax: 1000,
      coldMaxRssBytesMax: 2 * 1024 * 1024 * 1024,
      warmMaxRssBytesMax: 1 * 1024 * 1024 * 1024,
    },
  });

  assert.ok(report.metrics.coldMs > 0);
  assert.ok(typeof report.thresholdVerdict.pass === 'boolean');
  assert.equal(report.thresholdVerdict.pass, true);
});
