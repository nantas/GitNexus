import { describe, it, expect } from 'vitest'

import { runUnityLazyContextSampler } from './unity-lazy-context-sampler.js';

it('sampler emits cold/warm latency and rss metrics with threshold verdict', async () => {
  const fakeRunner = async ({ warm }: { warm: boolean }) => ({
    durationMs: warm ? 420 : 6200,
    maxRssBytes: warm ? 650 * 1024 * 1024 : 1700 * 1024 * 1024,
    exitCode: 0,
    stdout: '',
    stderr: '',
    hydrationMeta: warm
      ? { requestedMode: 'compact', effectiveMode: 'parity', isComplete: true, needsParityRetry: false }
      : { requestedMode: 'compact', effectiveMode: 'compact', isComplete: false, needsParityRetry: true },
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

  expect(report.metrics.coldMs > 0).toBeTruthy();
  expect(typeof report.hydrationMetaSummary.compactNeedsRetryRate).toBe('number');
  expect(typeof report.hydrationMetaSummary.parityCompleteRate).toBe('number');
  expect(typeof report.sizeLatency.summarySizeReductionPct).toBe('number');
  expect(typeof report.sizeLatency.queryContextP95DeltaPct).toBe('number');
  expect(report.sizeLatency.summarySizeReductionPct >= 60).toBe(true);
  expect(report.sizeLatency.queryContextP95DeltaPct <= 15).toBe(true);
  expect(typeof report.thresholdVerdict.pass === 'boolean').toBeTruthy();
  expect(report.thresholdVerdict.pass).toBe(true);
});
