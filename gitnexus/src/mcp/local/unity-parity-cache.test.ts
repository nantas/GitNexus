import { describe, it, expect } from 'vitest';

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readUnityParityCache, upsertUnityParityCache } from './unity-parity-cache.js';

it('unity parity cache reads and writes by symbol key', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-unity-parity-'));
  try {
    const before = await readUnityParityCache(storagePath, 'abc123', 'Class:Foo');
    expect(before).toBe(null);

    await upsertUnityParityCache(storagePath, 'abc123', 'Class:Foo', {
      resourceBindings: [{
        resourcePath: 'Assets/A.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '100',
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
        evidence: { line: 1, lineText: 'm_Script: ...' },
      } as any],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    });

    const after = await readUnityParityCache(storagePath, 'abc123', 'Class:Foo');
    expect(after?.resourceBindings.length).toBe(1);
    expect(after?.resourceBindings[0]?.componentObjectId).toBe('100');
  } finally {
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});

it('unity parity cache invalidates entries on indexed commit change', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-unity-parity-'));
  try {
    await upsertUnityParityCache(storagePath, 'old-commit', 'Class:Foo', {
      resourceBindings: [{
        resourcePath: 'Assets/A.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '100',
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
        evidence: { line: 1, lineText: 'm_Script: ...' },
      } as any],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    });

    const stale = await readUnityParityCache(storagePath, 'new-commit', 'Class:Foo');
    expect(stale).toBe(null);
  } finally {
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});

it('unity parity cache persists entries in shard files and supports atomic replace', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-unity-parity-'));
  try {
    await upsertUnityParityCache(storagePath, 'abc123', 'Class:Foo', {
      resourceBindings: [{
        resourcePath: 'Assets/A.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '101',
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
        evidence: { line: 1, lineText: 'm_Script: ...' },
      } as any],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    });
    await upsertUnityParityCache(storagePath, 'abc123', 'Class:Bar', {
      resourceBindings: [{
        resourcePath: 'Assets/B.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '102',
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
        evidence: { line: 1, lineText: 'm_Script: ...' },
      } as any],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    });

    const shardsDir = path.join(storagePath, 'unity-parity-cache');
    const shards = await fs.readdir(shardsDir);
    expect(shards.length > 0).toBeTruthy();
    expect(shards.every((name) => name.endsWith('.json'))).toBeTruthy();
  } finally {
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});

it('unity parity cache evicts oldest entries when max entries exceeded', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-unity-parity-'));
  try {
    const shard = (key: string): string => createHash('sha1').update(key).digest('hex').slice(0, 2);
    const firstKey = 'Class:A';
    let secondKey = '';
    for (let i = 0; i < 4096; i += 1) {
      const candidate = `Class:B:${i}`;
      if (shard(candidate) === shard(firstKey)) {
        secondKey = candidate;
        break;
      }
    }
    expect(secondKey).not.toBe('');

    await upsertUnityParityCache(storagePath, 'abc123', firstKey, {
      resourceBindings: [{
        resourcePath: 'Assets/A.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '201',
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
        evidence: { line: 1, lineText: 'm_Script: ...' },
      } as any],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    }, { maxEntries: 1 });

    await upsertUnityParityCache(storagePath, 'abc123', secondKey, {
      resourceBindings: [{
        resourcePath: 'Assets/B.prefab',
        resourceType: 'prefab',
        bindingKind: 'direct',
        componentObjectId: '202',
        serializedFields: { scalarFields: [], referenceFields: [] },
        resolvedReferences: [],
        evidence: { line: 1, lineText: 'm_Script: ...' },
      } as any],
      serializedFields: { scalarFields: [], referenceFields: [] },
      unityDiagnostics: [],
    }, { maxEntries: 1 });

    const evicted = await readUnityParityCache(storagePath, 'abc123', firstKey);
    const retained = await readUnityParityCache(storagePath, 'abc123', secondKey);
    expect(evicted).toBe(null);
    expect(retained).toBeTruthy();
  } finally {
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});
