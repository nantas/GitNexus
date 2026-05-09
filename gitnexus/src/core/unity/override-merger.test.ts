import { describe, it, expect } from 'vitest';

import { mergeOverrideChain, type UnityObjectLayer } from './override-merger.js';

it('mergeOverrideChain applies base -> variant -> nested -> scene order', () => {
  const baseComponent: UnityObjectLayer = {
    sourceLayer: 'base',
    scalarFields: {
      needPause: { value: '0' },
      title: { value: 'Base' },
    },
    referenceFields: {
      mainUIDocument: { fileId: '1000', guid: 'base-guid' },
    },
  };

  const variantComponent: UnityObjectLayer = {
    sourceLayer: 'variant',
    scalarFields: {
      title: { value: 'Variant' },
    },
    referenceFields: {
      mainUIDocument: { fileId: '2000', guid: 'variant-guid' },
    },
  };

  const nestedComponent: UnityObjectLayer = {
    sourceLayer: 'nested',
    scalarFields: {
      subtitle: { value: 'Nested' },
    },
  };

  const sceneOverride: UnityObjectLayer = {
    sourceLayer: 'scene',
    scalarFields: {
      needPause: { value: '1' },
    },
    referenceFields: {
      mainUIDocument: { fileId: '11400000', guid: 'scene-guid' },
    },
  };

  const merged = mergeOverrideChain(baseComponent, variantComponent, nestedComponent, sceneOverride);

  expect(merged.scalarFields.needPause.value).toBe('1');
  expect(merged.scalarFields.needPause.sourceLayer).toBe('scene');
  expect(merged.scalarFields.title.value).toBe('Variant');
  expect(merged.scalarFields.title.sourceLayer).toBe('variant');
  expect(merged.scalarFields.subtitle.value).toBe('Nested');
  expect(merged.referenceFields.mainUIDocument.fileId).toBe('11400000');
  expect(merged.referenceFields.mainUIDocument.sourceLayer).toBe('scene');
});
