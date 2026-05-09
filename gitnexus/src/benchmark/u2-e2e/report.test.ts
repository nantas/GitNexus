import { describe, it, expect } from 'vitest'

import { buildFinalVerdictMarkdown } from './report.js';

it('buildFinalVerdictMarkdown includes estimate comparison and symbol outcomes', () => {
  const md = buildFinalVerdictMarkdown({
    runId: 'test-run',
    buildTimings: { buildMs: 1200, pipelineProfileMs: 2500, analyzeSec: 114.8 },
    estimateComparison: { status: 'in-range', inRange: true, actualSec: 500, lower: 322.6, upper: 540.1, deltaSec: 0 },
    retrievalSummary: {
      symbols: [
        { symbol: 'MainUIManager', pass: true, stepCount: 3 },
        { symbol: 'CoinPowerUp', pass: true, stepCount: 3 },
      ],
      tokenSummary: { totalTokensEst: 3456, totalDurationMs: 876 },
      failures: [],
    },
    failures: [],
  });

  expect(md).toMatch(/Estimate Comparison/);
  expect(md).toMatch(/MainUIManager/);
  expect(md).toMatch(/CoinPowerUp/);
});

it('buildFinalVerdictMarkdown deduplicates repeated failures and renders serialized edge count', () => {
  const md = buildFinalVerdictMarkdown({
    runId: 'test-run',
    retrievalSummary: {
      symbols: [{ symbol: 'AssetRef', pass: true, stepCount: 4 }],
      tokenSummary: { totalTokensEst: 100, totalDurationMs: 12.3 },
      serializedTypeEdgeCount: 12,
      failures: ['duration.min=1.1ms median=2.2ms max=3.3ms'],
    },
    failures: ['duration.min=1.1ms median=2.2ms max=3.3ms'],
  });

  const duplicateMatches = md.match(/duration\.min=1\.1ms median=2\.2ms max=3\.3ms/g) || [];
  expect(duplicateMatches.length).toBe(1);
  expect(md).toMatch(/UNITY_SERIALIZED_TYPE_IN Edges: 12/);
});

it('buildFinalVerdictMarkdown renders CharacterList AssetRef sprite summary when provided', () => {
  const md = buildFinalVerdictMarkdown({
    runId: 'test-run',
    retrievalSummary: {
      symbols: [{ symbol: 'AssetRef', pass: true, stepCount: 4 }],
      tokenSummary: { totalTokensEst: 100, totalDurationMs: 12.3 },
      serializedTypeEdgeCount: 12,
      characterListAssetRefSprite: {
        extractedAssetRefInstances: 127,
        nonEmptyAssetRefInstances: 123,
        spriteAssetRefInstances: 63,
        spriteRatioInNonEmpty: 0.5122,
        uniqueSpriteAssets: 54,
      },
      failures: [],
    },
    failures: [],
  } as any);

  expect(md).toMatch(/CharacterList AssetRef Sprite Instances: 63/);
  expect(md).toMatch(/CharacterList AssetRef Sprite Ratio: 51.22%/);
});
