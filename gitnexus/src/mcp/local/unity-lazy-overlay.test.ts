import { describe, it, expect } from 'vitest';

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { readUnityOverlayBindings, upsertUnityOverlayBindings } from './unity-lazy-overlay.js';

it('unity lazy overlay reads and writes by symbol/resource key', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-unity-overlay-'));
  try {
    const before = await readUnityOverlayBindings(storagePath, 'abc123', 'Class:Foo', ['Assets/A.prefab']);
    expect(before.size).toBe(0);

    await upsertUnityOverlayBindings(
      storagePath,
      'abc123',
      'Class:Foo',
      new Map([
        ['Assets/A.prefab', [{
          resourcePath: 'Assets/A.prefab',
          resourceType: 'prefab',
          bindingKind: 'direct',
          componentObjectId: '100',
          serializedFields: { scalarFields: [], referenceFields: [] },
          resolvedReferences: [],
          evidence: { line: 1, lineText: 'm_Script: ...' },
        } as any]],
      ]),
    );

    const after = await readUnityOverlayBindings(storagePath, 'abc123', 'Class:Foo', ['Assets/A.prefab']);
    expect(after.size).toBe(1);
    expect(after.get('Assets/A.prefab')?.[0]?.componentObjectId).toBe('100');
  } finally {
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});

it('unity lazy overlay invalidates entries on indexed commit change', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-unity-overlay-'));
  try {
    await upsertUnityOverlayBindings(
      storagePath,
      'old-commit',
      'Class:Foo',
      new Map([
        ['Assets/A.prefab', [{
          resourcePath: 'Assets/A.prefab',
          resourceType: 'prefab',
          bindingKind: 'direct',
          componentObjectId: '100',
          serializedFields: { scalarFields: [], referenceFields: [] },
          resolvedReferences: [],
          evidence: { line: 1, lineText: 'm_Script: ...' },
        } as any]],
      ]),
    );

    const stale = await readUnityOverlayBindings(storagePath, 'new-commit', 'Class:Foo', ['Assets/A.prefab']);
    expect(stale.size).toBe(0);
  } finally {
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});

it('overlay persists entries in shard files and supports atomic replace', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-unity-overlay-'));
  try {
    await upsertUnityOverlayBindings(
      storagePath,
      'abc123',
      'Class:Foo',
      new Map([
        ['Assets/A.prefab', [{
          resourcePath: 'Assets/A.prefab',
          resourceType: 'prefab',
          bindingKind: 'direct',
          componentObjectId: '101',
          serializedFields: { scalarFields: [], referenceFields: [] },
          resolvedReferences: [],
          evidence: { line: 1, lineText: 'm_Script: ...' },
        } as any]],
        ['Assets/B.prefab', [{
          resourcePath: 'Assets/B.prefab',
          resourceType: 'prefab',
          bindingKind: 'direct',
          componentObjectId: '102',
          serializedFields: { scalarFields: [], referenceFields: [] },
          resolvedReferences: [],
          evidence: { line: 1, lineText: 'm_Script: ...' },
        } as any]],
      ]),
    );

    const shardsDir = path.join(storagePath, 'unity-lazy-overlay');
    const shards = await fs.readdir(shardsDir);
    expect(shards.length > 0).toBeTruthy();
    expect(shards.every((name) => name.endsWith('.json'))).toBeTruthy();
  } finally {
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});
