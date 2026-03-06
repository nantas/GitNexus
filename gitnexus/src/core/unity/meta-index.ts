import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';

const GUID_PATTERN = /^guid:\s*([0-9a-f]{32})\s*$/im;

export interface BuildMetaIndexOptions {
  metaFiles?: string[];
}

export async function buildMetaIndex(repoRoot: string, options: BuildMetaIndexOptions = {}): Promise<Map<string, string>> {
  const metaFiles = await resolveMetaFiles(repoRoot, options.metaFiles);

  const index = new Map<string, string>();

  for (const metaPath of metaFiles) {
    const absolutePath = path.join(repoRoot, metaPath);
    let content = '';
    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    const match = content.match(GUID_PATTERN);
    if (!match) continue;

    const scriptPath = metaPath.slice(0, -'.meta'.length).replace(/\\/g, '/');
    index.set(match[1], scriptPath);
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

function normalizeRelativePath(repoRoot: string, filePath: string): string | null {
  const relativePath = path.isAbsolute(filePath) ? path.relative(repoRoot, filePath) : filePath;
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.startsWith('../')) return null;
  return normalized;
}
