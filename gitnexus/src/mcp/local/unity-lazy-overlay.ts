import fs from 'node:fs/promises';
import path from 'node:path';
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

const OVERLAY_FILENAME = 'unity-lazy-overlay.json';

function buildKey(symbolUid: string, resourcePath: string): string {
  return `${symbolUid}::${resourcePath}`;
}

async function readOverlayDocument(storagePath: string, indexedCommit: string): Promise<UnityLazyOverlayDocument> {
  const overlayPath = path.join(storagePath, OVERLAY_FILENAME);
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

async function writeOverlayDocument(storagePath: string, doc: UnityLazyOverlayDocument): Promise<void> {
  const overlayPath = path.join(storagePath, OVERLAY_FILENAME);
  await fs.mkdir(storagePath, { recursive: true });
  await fs.writeFile(overlayPath, JSON.stringify(doc), 'utf-8');
}

export async function readUnityOverlayBindings(
  storagePath: string,
  indexedCommit: string,
  symbolUid: string,
  resourcePaths: string[],
): Promise<Map<string, ResolvedUnityBinding[]>> {
  const doc = await readOverlayDocument(storagePath, indexedCommit);
  const output = new Map<string, ResolvedUnityBinding[]>();
  for (const resourcePath of resourcePaths) {
    const key = buildKey(symbolUid, resourcePath);
    const entry = doc.entries[key];
    if (entry && Array.isArray(entry.bindings)) {
      output.set(resourcePath, entry.bindings);
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

  const doc = await readOverlayDocument(storagePath, indexedCommit);
  const now = new Date().toISOString();
  for (const [resourcePath, bindings] of byResourcePath.entries()) {
    const key = buildKey(symbolUid, resourcePath);
    doc.entries[key] = {
      symbolUid,
      resourcePath,
      bindings,
      updatedAt: now,
    };
  }
  await writeOverlayDocument(storagePath, doc);
}
