import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadMeta, readRegistry, registerRepo, saveMeta } from '../../src/storage/repo-manager.js';

function makeMeta(repoPath: string, lastCommit: string) {
  return {
    repoPath,
    lastCommit,
    indexedAt: '2026-03-02T00:00:00.000Z',
    stats: { files: 10, nodes: 20, edges: 30 },
  };
}

describe('registerRepo', () => {
  it('stores alias and rejects collisions on different paths', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-home-'));
    const originalHome = process.env.GITNEXUS_HOME;
    process.env.GITNEXUS_HOME = tmpHome;
    try {
      const repoA = path.join(tmpHome, 'repo-a');
      const repoB = path.join(tmpHome, 'repo-b');
      await fs.mkdir(repoA, { recursive: true });
      await fs.mkdir(repoB, { recursive: true });

      await registerRepo(repoA, makeMeta(repoA, 'abc1234'), { name: 'neonspark-v1-subset' });
      const entries = await readRegistry();
      expect(entries.length).toBe(1);
      expect(entries[0].name).toBe('neonspark-v1-subset');

      await expect(
        registerRepo(repoB, makeMeta(repoB, 'def5678'), { name: 'neonspark-v1-subset' }),
      ).rejects.toThrow(/already used/i);
    } finally {
      if (originalHome === undefined) {
        delete process.env.GITNEXUS_HOME;
      } else {
        process.env.GITNEXUS_HOME = originalHome;
      }
    }
  });
});

describe('saveMeta/loadMeta', () => {
  it('persists analyzeOptions for future re-index reuse', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-meta-'));
    const storagePath = path.join(tmpDir, '.gitnexus');

    await saveMeta(storagePath, {
      repoPath: tmpDir,
      repoId: 'neonspark-v1-subset',
      lastCommit: 'abc1234',
      indexedAt: '2026-03-12T00:00:00.000Z',
      analyzeOptions: {
        includeExtensions: ['.cs'],
        scopeRules: ['Assets/NEON/Code'],
        repoAlias: 'neonspark-v1-subset',
        embeddings: true,
        csharpDefineCsproj: '/path/to/Assembly-CSharp.csproj',
      },
      stats: { files: 1, nodes: 2, edges: 3 },
    });

    const meta = await loadMeta(storagePath);
    expect(meta?.analyzeOptions).toEqual({
      includeExtensions: ['.cs'],
      scopeRules: ['Assets/NEON/Code'],
      repoAlias: 'neonspark-v1-subset',
      embeddings: true,
      csharpDefineCsproj: '/path/to/Assembly-CSharp.csproj',
    });
    expect(meta?.repoId).toBe('neonspark-v1-subset');
  });
});
