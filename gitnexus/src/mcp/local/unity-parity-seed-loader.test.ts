import { describe, it, expect, vi, afterEach } from 'vitest';

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { __resetUnityParitySeedLoaderCacheForTest, loadUnityParitySeed } from './unity-parity-seed-loader.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const baseSeed = {
  version: 1 as const,
  symbolToScriptPath: { DoorObj: 'Assets/Code/DoorObj.cs' },
  scriptPathToGuid: { 'Assets/Code/DoorObj.cs': 'abc123abc123abc123abc123abc123ab' },
  guidToResourcePaths: { abc123abc123abc123abc123abc123ab: ['Assets/Prefabs/Door.prefab'] },
};

async function writeSeed(storagePath: string, symbol = 'DoorObj'): Promise<void> {
  await fs.writeFile(
    path.join(storagePath, 'unity-parity-seed.json'),
    JSON.stringify({
      ...baseSeed,
      symbolToScriptPath: { [symbol]: `Assets/Code/${symbol}.cs` },
      scriptPathToGuid: { [`Assets/Code/${symbol}.cs`]: 'abc123abc123abc123abc123abc123ab' },
    }),
    'utf-8',
  );
}

it('loadUnityParitySeed returns null on missing file and parsed object on valid file', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-seed-loader-'));
  try {
    const missing = await loadUnityParitySeed(storagePath);
    expect(missing).toBe(null);

    await writeSeed(storagePath, 'DoorObj');

    const loaded = await loadUnityParitySeed(storagePath);
    expect(loaded?.version).toBe(1);
    expect(loaded?.symbolToScriptPath.DoorObj).toBe('Assets/Code/DoorObj.cs');
  } finally {
    __resetUnityParitySeedLoaderCacheForTest();
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});

it('loadUnityParitySeed deduplicates concurrent requests for same storage key', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-seed-loader-'));
  try {
    await writeSeed(storagePath, 'ConcurrentSymbol');
    const seedContent = await fs.readFile(path.join(storagePath, 'unity-parity-seed.json'), 'utf-8');
    let readFileCalls = 0;
    vi.spyOn(fs, 'readFile').mockImplementation(async () => {
      readFileCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return seedContent;
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => loadUnityParitySeed(storagePath)),
    );
    expect(results.every((row) => row?.symbolToScriptPath.ConcurrentSymbol)).toBe(true);
    expect(readFileCalls).toBe(1);
  } finally {
    __resetUnityParitySeedLoaderCacheForTest();
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});

it('loadUnityParitySeed evicts idle cache entry after ttl', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-seed-loader-'));

  try {
    await writeSeed(storagePath, 'IdleSymbol');
    const seedContent = await fs.readFile(path.join(storagePath, 'unity-parity-seed.json'), 'utf-8');
    let readFileCalls = 0;
    vi.spyOn(fs, 'readFile').mockImplementation(async () => {
      readFileCalls += 1;
      return seedContent;
    });

    await loadUnityParitySeed(storagePath, { idleMsOverride: 15 });
    await loadUnityParitySeed(storagePath, { idleMsOverride: 15 });
    expect(readFileCalls).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 30));
    await loadUnityParitySeed(storagePath, { idleMsOverride: 15 });
    expect(readFileCalls).toBe(2);
  } finally {
    __resetUnityParitySeedLoaderCacheForTest();
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});

it('loadUnityParitySeed invalidates cache when seed mtime changes', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-seed-loader-'));
  const seedPath = path.join(storagePath, 'unity-parity-seed.json');
  try {
    await writeSeed(storagePath, 'VersionA');
    let currentSeedContent = await fs.readFile(path.join(storagePath, 'unity-parity-seed.json'), 'utf-8');
    let readFileCalls = 0;
    vi.spyOn(fs, 'readFile').mockImplementation(async () => {
      readFileCalls += 1;
      return currentSeedContent;
    });

    const first = await loadUnityParitySeed(storagePath);
    const second = await loadUnityParitySeed(storagePath);
    expect(first?.symbolToScriptPath.VersionA).toBe('Assets/Code/VersionA.cs');
    expect(second?.symbolToScriptPath.VersionA).toBe('Assets/Code/VersionA.cs');
    expect(readFileCalls).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeSeed(storagePath, 'VersionB');
    // Update the content variable to reflect the new version
    currentSeedContent = JSON.stringify({
      ...baseSeed,
      symbolToScriptPath: { VersionB: 'Assets/Code/VersionB.cs' },
      scriptPathToGuid: { 'Assets/Code/VersionB.cs': 'abc123abc123abc123abc123abc123ab' },
    });
    await fs.utimes(seedPath, new Date(), new Date());

    const third = await loadUnityParitySeed(storagePath);
    expect(third?.symbolToScriptPath.VersionB).toBe('Assets/Code/VersionB.cs');
    expect(readFileCalls).toBe(2);
  } finally {
    __resetUnityParitySeedLoaderCacheForTest();
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});
