import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ResolvedUnityBinding } from '../../core/unity/resolver.js';

interface UnityOverlayEntry {
  symbolUid: string;
  resourcePath: string;
  bindings: ResolvedUnityBinding[];
  updatedAt: string;
}

interface UnityLazyOverlayDocument {
  version: 1;
  indexedCommit: string;
  entries: Record<string, UnityOverlayEntry>;
}

const OVERLAY_DIRNAME = 'unity-lazy-overlay';

function buildKey(symbolUid: string, resourcePath: string): string {
  return `${symbolUid}::${resourcePath}`;
}

function shardKeyForEntry(symbolUid: string, resourcePath: string): string {
  const key = buildKey(symbolUid, resourcePath);
  return createHash('sha1').update(key).digest('hex').slice(0, 2);
}

function getShardPath(storagePath: string, shardKey: string): string {
  return path.join(storagePath, OVERLAY_DIRNAME, `${shardKey}.json`);
}

async function readOverlayDocument(
  storagePath: string,
  indexedCommit: string,
  shardKey: string,
): Promise<UnityLazyOverlayDocument> {
  const overlayPath = getShardPath(storagePath, shardKey);
  try {
    const raw = await fs.readFile(overlayPath, 'utf-8');
    const parsed = JSON.parse(raw) as UnityLazyOverlayDocument;
    if (!parsed || parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== 'object') {
      return { version: 1, indexedCommit, entries: {} };
    }
    if (parsed.indexedCommit !== indexedCommit) {
      return { version: 1, indexedCommit, entries: {} };
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, indexedCommit, entries: {} };
    }
    throw error;
  }
}

async function writeOverlayDocument(storagePath: string, shardKey: string, doc: UnityLazyOverlayDocument): Promise<void> {
  const overlayDir = path.join(storagePath, OVERLAY_DIRNAME);
  const overlayPath = getShardPath(storagePath, shardKey);
  const tmpPath = `${overlayPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.mkdir(overlayDir, { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(doc), 'utf-8');
  await fs.rename(tmpPath, overlayPath);
}

export async function readUnityOverlayBindings(
  storagePath: string,
  indexedCommit: string,
  symbolUid: string,
  resourcePaths: string[],
): Promise<Map<string, ResolvedUnityBinding[]>> {
  const output = new Map<string, ResolvedUnityBinding[]>();
  const shardToPaths = new Map<string, string[]>();
  for (const resourcePath of resourcePaths) {
    const shardKey = shardKeyForEntry(symbolUid, resourcePath);
    const list = shardToPaths.get(shardKey) || [];
    list.push(resourcePath);
    shardToPaths.set(shardKey, list);
  }

  for (const [shardKey, paths] of shardToPaths.entries()) {
    const doc = await readOverlayDocument(storagePath, indexedCommit, shardKey);
    for (const resourcePath of paths) {
      const key = buildKey(symbolUid, resourcePath);
      const entry = doc.entries[key];
      if (entry && Array.isArray(entry.bindings)) {
        output.set(resourcePath, entry.bindings);
      }
    }
  }

  return output;
}

export async function upsertUnityOverlayBindings(
  storagePath: string,
  indexedCommit: string,
  symbolUid: string,
  byResourcePath: Map<string, ResolvedUnityBinding[]>,
): Promise<void> {
  if (byResourcePath.size === 0) {
    return;
  }

  const now = new Date().toISOString();

  const shardToEntries = new Map<string, Array<[string, ResolvedUnityBinding[]]>>();
  for (const [resourcePath, bindings] of byResourcePath.entries()) {
    const shardKey = shardKeyForEntry(symbolUid, resourcePath);
    const rows = shardToEntries.get(shardKey) || [];
    rows.push([resourcePath, bindings]);
    shardToEntries.set(shardKey, rows);
  }

  for (const [shardKey, rows] of shardToEntries.entries()) {
    const doc = await readOverlayDocument(storagePath, indexedCommit, shardKey);
    for (const [resourcePath, bindings] of rows) {
      const key = buildKey(symbolUid, resourcePath);
      doc.entries[key] = {
        symbolUid,
        resourcePath,
        bindings,
        updatedAt: now,
      };
    }
    await writeOverlayDocument(storagePath, shardKey, doc);
  }
}
