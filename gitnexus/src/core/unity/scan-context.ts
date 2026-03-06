import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import { buildMetaIndex } from './meta-index.js';
import type { UnityResourceGuidHit } from './resource-hit-scanner.js';
import type { UnityObjectBlock } from './yaml-object-graph.js';

const DECLARATION_PATTERN = /\b(?:class|struct|interface)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;
const GUID_IN_LINE_PATTERN = /\bguid:\s*([0-9a-f]{32})\b/gi;

export interface BuildScanContextInput {
  repoRoot: string;
  scopedPaths?: string[];
}

export interface UnityScanContext {
  symbolToScriptPath: Map<string, string>;
  scriptPathToGuid: Map<string, string>;
  guidToResourceHits: Map<string, UnityResourceGuidHit[]>;
  resourceDocCache: Map<string, UnityObjectBlock[]>;
}

export async function buildUnityScanContext(input: BuildScanContextInput): Promise<UnityScanContext> {
  const scriptFiles = await resolveScriptFiles(input.repoRoot, input.scopedPaths);
  const symbolToScriptPath = await buildSymbolScriptPathIndex(input.repoRoot, scriptFiles);

  const metaFiles = scriptFiles.map((scriptPath) => `${scriptPath}.meta`);
  const guidToScriptPath = await buildMetaIndex(input.repoRoot, { metaFiles });
  const scriptPathToGuid = new Map<string, string>();
  for (const [guid, scriptPath] of guidToScriptPath.entries()) {
    scriptPathToGuid.set(normalizeSlashes(scriptPath), guid);
  }

  const resourceFiles = await resolveResourceFiles(input.repoRoot, input.scopedPaths);
  const guidToResourceHits = await buildGuidHitIndex(input.repoRoot, scriptPathToGuid, resourceFiles);

  return {
    symbolToScriptPath,
    scriptPathToGuid,
    guidToResourceHits,
    resourceDocCache: new Map<string, UnityObjectBlock[]>(),
  };
}

async function buildSymbolScriptPathIndex(repoRoot: string, scriptFiles: string[]): Promise<Map<string, string>> {
  const candidates = new Map<string, Set<string>>();

  for (const scriptPath of scriptFiles) {
    const normalizedPath = normalizeSlashes(scriptPath);
    addSymbolCandidate(candidates, path.basename(normalizedPath, '.cs'), normalizedPath);

    const absolutePath = path.join(repoRoot, normalizedPath);
    let content = '';
    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }

    DECLARATION_PATTERN.lastIndex = 0;
    let match = DECLARATION_PATTERN.exec(content);
    while (match) {
      addSymbolCandidate(candidates, match[1], normalizedPath);
      match = DECLARATION_PATTERN.exec(content);
    }
  }

  const symbolToScriptPath = new Map<string, string>();
  for (const [symbol, paths] of candidates.entries()) {
    if (paths.size === 1) {
      symbolToScriptPath.set(symbol, [...paths][0]);
    }
  }

  return symbolToScriptPath;
}

async function buildGuidHitIndex(
  repoRoot: string,
  scriptPathToGuid: Map<string, string>,
  resourceFiles: string[],
): Promise<Map<string, UnityResourceGuidHit[]>> {
  const guidLookup = new Map<string, string>();
  for (const guid of scriptPathToGuid.values()) {
    guidLookup.set(guid.toLowerCase(), guid);
  }

  const guidToResourceHits = new Map<string, UnityResourceGuidHit[]>();

  for (const resourcePathRaw of resourceFiles) {
    const resourcePath = normalizeSlashes(resourcePathRaw);
    const absolutePath = path.join(repoRoot, resourcePath);
    let content = '';
    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }

    const resourceType = resourcePath.endsWith('.prefab') ? 'prefab' : 'scene';
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const seenCanonical = new Set<string>();
      GUID_IN_LINE_PATTERN.lastIndex = 0;
      let match = GUID_IN_LINE_PATTERN.exec(line);
      while (match) {
        const canonicalGuid = guidLookup.get(match[1].toLowerCase());
        if (canonicalGuid && !seenCanonical.has(canonicalGuid)) {
          seenCanonical.add(canonicalGuid);
          const existing = guidToResourceHits.get(canonicalGuid) || [];
          existing.push({
            resourcePath,
            resourceType,
            line: index + 1,
            lineText: line,
          });
          guidToResourceHits.set(canonicalGuid, existing);
        }
        match = GUID_IN_LINE_PATTERN.exec(line);
      }
    }
  }

  return guidToResourceHits;
}

async function resolveScriptFiles(repoRoot: string, scopedPaths?: string[]): Promise<string[]> {
  if (!scopedPaths || scopedPaths.length === 0) {
    return (await glob('**/*.cs', {
      cwd: repoRoot,
      nodir: true,
      dot: false,
    })).sort((left, right) => left.localeCompare(right));
  }

  const scopedScripts = scopedPaths
    .filter((value) => value.endsWith('.cs'))
    .map((value) => normalizeRelativePath(repoRoot, value))
    .filter((value): value is string => value !== null)
    .sort((left, right) => left.localeCompare(right));

  return [...new Set(scopedScripts)];
}

async function resolveResourceFiles(repoRoot: string, scopedPaths?: string[]): Promise<string[]> {
  if (!scopedPaths || scopedPaths.length === 0) {
    return (await glob(['**/*.prefab', '**/*.unity'], {
      cwd: repoRoot,
      nodir: true,
      dot: false,
    })).sort((left, right) => left.localeCompare(right));
  }

  const scopedResources = scopedPaths
    .filter((value) => value.endsWith('.prefab') || value.endsWith('.unity'))
    .map((value) => normalizeRelativePath(repoRoot, value))
    .filter((value): value is string => value !== null)
    .sort((left, right) => left.localeCompare(right));

  return [...new Set(scopedResources)];
}

function addSymbolCandidate(candidates: Map<string, Set<string>>, symbol: string, scriptPath: string): void {
  const existing = candidates.get(symbol) || new Set<string>();
  existing.add(scriptPath);
  candidates.set(symbol, existing);
}

function normalizeRelativePath(repoRoot: string, filePath: string): string | null {
  const relativePath = path.isAbsolute(filePath) ? path.relative(repoRoot, filePath) : filePath;
  const normalized = normalizeSlashes(relativePath);
  if (normalized.startsWith('../')) return null;
  return normalized;
}

function normalizeSlashes(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}
