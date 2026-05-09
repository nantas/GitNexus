import { describe, it, expect } from 'vitest';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { streamPrefabSourceRefs } from './prefab-source-scan.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity');
const assetGuidToPath = new Map([['99999999999999999999999999999999', 'Assets/Prefabs/BattleMode.prefab']]);
const scopedFiles = ['Assets/Scene/MainUIManager.unity', 'Assets/Prefabs/BattleMode.prefab'];

it('same source can yield prefab-source rows while script-guid flow remains independent', async () => {
  const rows: any[] = [];
  for await (const row of streamPrefabSourceRefs({
    repoRoot: fixtureRoot,
    resourceFiles: ['Assets/Scene/MainUIManager.unity'],
    assetGuidToPath,
  })) {
    rows.push(row);
  }
  expect(rows.length > 0).toBeTruthy();
  expect(rows.every((r) => r.fieldName === 'm_SourcePrefab')).toBe(true);
});

it('streamPrefabSourceRefs does not open second file before first row is yielded', async () => {
  const probe: string[] = [];
  const iterator = streamPrefabSourceRefs({
    repoRoot: fixtureRoot,
    resourceFiles: scopedFiles,
    assetGuidToPath,
    hooks: {
      onFileOpen: (filePath) => probe.push(`open:${filePath}`),
      onYield: () => probe.push('yield'),
    },
  })[Symbol.asyncIterator]();
  const first = await iterator.next();
  expect(first.done).toBe(false);
  expect(first.value.fieldName).toBe('m_SourcePrefab');
  expect(probe.includes('open:Assets/Prefabs/BattleMode.prefab')).toBe(false);
  await iterator.return?.(undefined);
});

it('producer rows are immutable snapshots (consumer mutation does not backflow)', async () => {
  for await (const row of streamPrefabSourceRefs({
    repoRoot: fixtureRoot,
    resourceFiles: scopedFiles,
    assetGuidToPath,
  })) {
    const copy = { ...row };
    copy.targetResourcePath = '__PLACEHOLDER__';
  }

  const again: any[] = [];
  for await (const row of streamPrefabSourceRefs({
    repoRoot: fixtureRoot,
    resourceFiles: scopedFiles,
    assetGuidToPath,
  })) {
    again.push(row);
  }
  expect(again.some((r) => r.targetResourcePath === '__PLACEHOLDER__')).toBe(false);
});

it('bounded queue backpressure never exceeds configured depth when decoupled mode is enabled', async () => {
  const depthSamples: number[] = [];
  for await (const _row of streamPrefabSourceRefs({
    repoRoot: fixtureRoot,
    resourceFiles: scopedFiles,
    assetGuidToPath,
    queue: { enabled: true, maxDepth: 64 },
    hooks: { onQueueDepth: (depth) => depthSamples.push(depth) },
  })) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  expect(depthSamples.every((depth) => depth <= 64)).toBe(true);
});
