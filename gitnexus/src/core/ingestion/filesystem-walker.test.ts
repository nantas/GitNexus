import { describe, it, expect } from 'vitest';

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { walkRepositoryPaths, walkUnityResourcePaths } from './filesystem-walker.js';

it('walkUnityResourcePaths includes large Unity resources while walkRepositoryPaths skips them', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-fswalker-'));
  const assetsDir = path.join(repoRoot, 'Assets/Scene');
  await fs.mkdir(assetsDir, { recursive: true });

  const largePrefab = 'Assets/Scene/Large.prefab';
  const smallPrefab = 'Assets/Scene/Small.prefab';
  const scriptFile = 'Assets/Scene/Test.cs';

  try {
    await fs.writeFile(path.join(repoRoot, largePrefab), 'x'.repeat(600 * 1024), 'utf-8');
    await fs.writeFile(path.join(repoRoot, smallPrefab), 'small', 'utf-8');
    await fs.writeFile(path.join(repoRoot, scriptFile), 'public class Test {}', 'utf-8');

    const scanned = await walkRepositoryPaths(repoRoot);
    const scannedPaths = new Set(scanned.map((entry) => entry.path));
    expect(scannedPaths.has(largePrefab)).toBe(false);
    expect(scannedPaths.has(smallPrefab)).toBe(true);
    expect(scannedPaths.has(scriptFile)).toBe(true);

    const unityPaths = await walkUnityResourcePaths(repoRoot);
    expect(unityPaths.includes(largePrefab)).toBe(true);
    expect(unityPaths.includes(smallPrefab)).toBe(true);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});

it('walkUnityResourcePaths only returns prefab/unity/asset files and still honors ignore rules', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-fswalker-'));
  await fs.mkdir(path.join(repoRoot, 'Assets/Scene'), { recursive: true });
  await fs.mkdir(path.join(repoRoot, 'node_modules/pkg'), { recursive: true });

  try {
    await fs.writeFile(path.join(repoRoot, 'Assets/Scene/Keep.prefab'), 'prefab', 'utf-8');
    await fs.writeFile(path.join(repoRoot, 'Assets/Scene/Keep.unity'), 'scene', 'utf-8');
    await fs.writeFile(path.join(repoRoot, 'Assets/Scene/Keep.asset'), 'asset', 'utf-8');
    await fs.writeFile(path.join(repoRoot, 'Assets/Scene/Ignore.cs'), 'public class Ignore {}', 'utf-8');
    await fs.writeFile(path.join(repoRoot, 'node_modules/pkg/Hidden.prefab'), 'hidden', 'utf-8');

    const unityPaths = await walkUnityResourcePaths(repoRoot);
    expect(unityPaths).toEqual([
      'Assets/Scene/Keep.asset',
      'Assets/Scene/Keep.prefab',
      'Assets/Scene/Keep.unity',
    ]);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});
