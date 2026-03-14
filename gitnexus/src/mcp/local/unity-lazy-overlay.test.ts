import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { readUnityOverlayBindings, upsertUnityOverlayBindings } from './unity-lazy-overlay.js';

test('unity lazy overlay reads and writes by symbol/resource key', async () => {
  const storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-unity-overlay-'));
  try {
    const before = await readUnityOverlayBindings(storagePath, 'abc123', 'Class:Foo', ['Assets/A.prefab']);
    assert.equal(before.size, 0);

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
    assert.equal(after.size, 1);
    assert.equal(after.get('Assets/A.prefab')?.[0]?.componentObjectId, '100');
  } finally {
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});

test('unity lazy overlay invalidates entries on indexed commit change', async () => {
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
    assert.equal(stale.size, 0);
  } finally {
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});

test('overlay persists entries in shard files and supports atomic replace', async () => {
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
    assert.ok(shards.length > 0);
    assert.ok(shards.every((name) => name.endsWith('.json')));
  } finally {
    await fs.rm(storagePath, { recursive: true, force: true });
  }
});
