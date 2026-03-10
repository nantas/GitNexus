import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';

export interface UnityResourceGuidHit {
  resourcePath: string;
  resourceType: 'prefab' | 'scene' | 'asset';
  line: number;
  lineText: string;
}

export interface FindGuidHitsOptions {
  resourceFiles?: string[];
}

export async function findGuidHits(
  repoRoot: string,
  guid: string,
  options: FindGuidHitsOptions = {},
): Promise<UnityResourceGuidHit[]> {
  const resourceFiles = await resolveResourceFiles(repoRoot, options.resourceFiles);

  const hits: UnityResourceGuidHit[] = [];

  for (const resourcePath of resourceFiles) {
    const absolutePath = path.join(repoRoot, resourcePath);
    let content = '';
    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].includes(guid)) continue;
      hits.push({
        resourcePath: resourcePath.replace(/\\/g, '/'),
        resourceType: inferResourceType(resourcePath),
        line: index + 1,
        lineText: lines[index],
      });
    }
  }

  return hits;
}

async function resolveResourceFiles(repoRoot: string, scopedResourceFiles?: string[]): Promise<string[]> {
  if (!scopedResourceFiles || scopedResourceFiles.length === 0) {
    return (await glob(['**/*.prefab', '**/*.unity', '**/*.asset'], {
      cwd: repoRoot,
      nodir: true,
      dot: false,
    })).sort((left, right) => left.localeCompare(right));
  }

  const normalized = scopedResourceFiles
    .filter((value) => value.endsWith('.prefab') || value.endsWith('.unity') || value.endsWith('.asset'))
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

function inferResourceType(resourcePath: string): UnityResourceGuidHit['resourceType'] {
  if (resourcePath.endsWith('.prefab')) return 'prefab';
  if (resourcePath.endsWith('.asset')) return 'asset';
  return 'scene';
}
