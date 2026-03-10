import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';

const GUID_PATTERN = /^guid:\s*([0-9a-f]{32})\s*$/im;
const META_INDEX_READ_CONCURRENCY = 64;

export interface BuildMetaIndexOptions {
  metaFiles?: string[];
}

export async function buildMetaIndex(repoRoot: string, options: BuildMetaIndexOptions = {}): Promise<Map<string, string>> {
  const metaFiles = await resolveMetaFiles(repoRoot, options.metaFiles);

  const entries = await mapWithConcurrency(metaFiles, META_INDEX_READ_CONCURRENCY, async (metaPath) => {
    const absolutePath = path.join(repoRoot, metaPath);
    let content = '';
    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const match = content.match(GUID_PATTERN);
    if (!match) return null;

    const scriptPath = metaPath.slice(0, -'.meta'.length).replace(/\\/g, '/');
    return [match[1], scriptPath] as const;
  });

  const index = new Map<string, string>();
  for (const entry of entries) {
    if (!entry) continue;
    index.set(entry[0], entry[1]);
  }

  return index;
}

export async function buildAssetMetaIndex(
  repoRoot: string,
  options: BuildMetaIndexOptions = {},
): Promise<Map<string, string>> {
  const metaFiles = await resolveAssetMetaFiles(repoRoot, options.metaFiles);

  const entries = await mapWithConcurrency(metaFiles, META_INDEX_READ_CONCURRENCY, async (metaPath) => {
    const absolutePath = path.join(repoRoot, metaPath);
    let content = '';
    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const match = content.match(GUID_PATTERN);
    if (!match) return null;

    const assetPath = metaPath.slice(0, -'.meta'.length).replace(/\\/g, '/');
    return [match[1], assetPath] as const;
  });

  const index = new Map<string, string>();
  for (const entry of entries) {
    if (!entry) continue;
    index.set(entry[0], entry[1]);
    index.set(entry[0].toLowerCase(), entry[1]);
  }

  return index;
}

async function resolveMetaFiles(repoRoot: string, scopedMetaFiles?: string[]): Promise<string[]> {
  if (!scopedMetaFiles || scopedMetaFiles.length === 0) {
    return (await glob('**/*.cs.meta', {
      cwd: repoRoot,
      nodir: true,
      dot: false,
    })).sort((left, right) => left.localeCompare(right));
  }

  const normalized = scopedMetaFiles
    .filter((value) => value.endsWith('.cs.meta'))
    .map((value) => normalizeRelativePath(repoRoot, value))
    .filter((value): value is string => value !== null)
    .sort((left, right) => left.localeCompare(right));

  return [...new Set(normalized)];
}

async function resolveAssetMetaFiles(repoRoot: string, scopedMetaFiles?: string[]): Promise<string[]> {
  if (!scopedMetaFiles || scopedMetaFiles.length === 0) {
    return (await glob('**/*.meta', {
      cwd: repoRoot,
      nodir: true,
      dot: false,
    })).sort((left, right) => left.localeCompare(right));
  }

  const normalized = scopedMetaFiles
    .filter((value) => value.endsWith('.meta'))
    .map((value) => normalizeRelativePath(repoRoot, value))
    .filter((value): value is string => value !== null)
    .sort((left, right) => left.localeCompare(right));

  return [...new Set(normalized)];
}

function normalizeRelativePath(repoRoot: string, filePath: string): string | null {
  const relativePath = path.isAbsolute(filePath) ? path.relative(repoRoot, filePath) : filePath;
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.startsWith('../')) return null;
  return normalized;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: safeConcurrency }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) break;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}
