import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalVerdictMarkdown } from './report.js';

test('buildFinalVerdictMarkdown includes estimate comparison and symbol outcomes', () => {
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

  assert.match(md, /Estimate Comparison/);
  assert.match(md, /MainUIManager/);
  assert.match(md, /CoinPowerUp/);
});

test('buildFinalVerdictMarkdown deduplicates repeated failures and renders serialized edge count', () => {
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
  assert.equal(duplicateMatches.length, 1);
  assert.match(md, /UNITY_SERIALIZED_TYPE_IN Edges: 12/);
});

test('buildFinalVerdictMarkdown renders CharacterList AssetRef sprite summary when provided', () => {
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

  assert.match(md, /CharacterList AssetRef Sprite Instances: 63/);
  assert.match(md, /CharacterList AssetRef Sprite Ratio: 51.22%/);
});
