import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import { buildAssetMetaIndex, buildMetaIndex } from './meta-index.js';
import type { UnityResourceGuidHit } from './resource-hit-scanner.js';
import type { UnityObjectBlock } from './yaml-object-graph.js';

const DECLARATION_PATTERN = /\b(?:class|struct|interface)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;
const GUID_IN_LINE_PATTERN = /\bguid:\s*([0-9a-f]{32})\b/gi;
const RESOURCE_HIT_SCAN_CONCURRENCY = 16;

export interface BuildScanContextInput {
  repoRoot: string;
  scopedPaths?: string[];
  symbolDeclarations?: UnitySymbolDeclaration[];
}

export interface UnitySymbolDeclaration {
  symbol: string;
  scriptPath: string;
}

export interface UnityScanContext {
  symbolToScriptPath: Map<string, string>;
  scriptPathToGuid: Map<string, string>;
  guidToResourceHits: Map<string, UnityResourceGuidHit[]>;
  assetGuidToPath?: Map<string, string>;
  resourceDocCache: Map<string, UnityObjectBlock[]>;
}

export async function buildUnityScanContext(input: BuildScanContextInput): Promise<UnityScanContext> {
  const scriptFiles =
    input.symbolDeclarations && input.symbolDeclarations.length > 0
      ? resolveScriptFilesFromSymbolDeclarations(input.repoRoot, input.symbolDeclarations, input.scopedPaths)
      : await resolveScriptFiles(input.repoRoot, input.scopedPaths);
  const symbolToScriptPath =
    input.symbolDeclarations && input.symbolDeclarations.length > 0
      ? buildSymbolScriptPathIndexFromDeclarations(input.repoRoot, input.symbolDeclarations, input.scopedPaths)
      : await buildSymbolScriptPathIndex(input.repoRoot, scriptFiles);

  const metaFiles = scriptFiles.map((scriptPath) => `${scriptPath}.meta`);
  const guidToScriptPath = await buildMetaIndex(input.repoRoot, { metaFiles });
  const scriptPathToGuid = new Map<string, string>();
  for (const [guid, scriptPath] of guidToScriptPath.entries()) {
    scriptPathToGuid.set(normalizeSlashes(scriptPath), guid);
  }

  const resourceFiles = await resolveResourceFiles(input.repoRoot, input.scopedPaths);
  const guidToResourceHits = await buildGuidHitIndex(input.repoRoot, scriptPathToGuid, resourceFiles);
  const assetMetaFiles = resolveAssetMetaFiles(input.repoRoot, input.scopedPaths, scriptFiles, resourceFiles);
  const assetGuidToPath = await buildAssetMetaIndex(input.repoRoot, { metaFiles: assetMetaFiles });

  return {
    symbolToScriptPath,
    scriptPathToGuid,
    guidToResourceHits,
    assetGuidToPath,
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
  if (scriptPathToGuid.size === 0 || resourceFiles.length === 0) {
    return new Map<string, UnityResourceGuidHit[]>();
  }

  const guidLookup = new Map<string, string>();
  for (const guid of scriptPathToGuid.values()) {
    guidLookup.set(guid.toLowerCase(), guid);
  }

  const perResourceHits = await mapWithConcurrency(
    resourceFiles,
    RESOURCE_HIT_SCAN_CONCURRENCY,
    async (resourcePathRaw) => {
      const resourcePath = normalizeSlashes(resourcePathRaw);
      const absolutePath = path.join(repoRoot, resourcePath);
      let content = '';
      try {
        content = await fs.readFile(absolutePath, 'utf-8');
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'EISDIR') {
          return new Map<string, UnityResourceGuidHit[]>();
        }
        throw error;
      }

      const resourceType = inferResourceType(resourcePath);
      const lines = content.split(/\r?\n/);
      const hits = new Map<string, UnityResourceGuidHit[]>();

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const seenCanonical = new Set<string>();
        GUID_IN_LINE_PATTERN.lastIndex = 0;
        let match = GUID_IN_LINE_PATTERN.exec(line);
        while (match) {
          const canonicalGuid = guidLookup.get(match[1].toLowerCase());
          if (canonicalGuid && !seenCanonical.has(canonicalGuid)) {
            seenCanonical.add(canonicalGuid);
            const existing = hits.get(canonicalGuid) || [];
            existing.push({
              resourcePath,
              resourceType,
              line: index + 1,
              lineText: line,
            });
            hits.set(canonicalGuid, existing);
          }
          match = GUID_IN_LINE_PATTERN.exec(line);
        }
      }

      return hits;
    },
  );

  const guidToResourceHits = new Map<string, UnityResourceGuidHit[]>();
  for (const hitMap of perResourceHits) {
    for (const [guid, hits] of hitMap.entries()) {
      const existing = guidToResourceHits.get(guid) || [];
      existing.push(...hits);
      guidToResourceHits.set(guid, existing);
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
    return (await glob(['**/*.prefab', '**/*.unity', '**/*.asset'], {
      cwd: repoRoot,
      nodir: true,
      dot: false,
    })).sort((left, right) => left.localeCompare(right));
  }

  const scopedResources = scopedPaths
    .filter((value) => value.endsWith('.prefab') || value.endsWith('.unity') || value.endsWith('.asset'))
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

function buildSymbolScriptPathIndexFromDeclarations(
  repoRoot: string,
  declarations: UnitySymbolDeclaration[],
  scopedPaths?: string[],
): Map<string, string> {
  const candidates = new Map<string, Set<string>>();
  const allowedScriptPaths = resolveScopedScriptAllowlist(repoRoot, scopedPaths);

  for (const declaration of declarations) {
    const symbol = String(declaration.symbol || '').trim();
    if (!symbol) continue;
    const scriptPath = normalizeRelativePath(repoRoot, declaration.scriptPath);
    if (!scriptPath) continue;
    if (allowedScriptPaths && !allowedScriptPaths.has(scriptPath)) continue;
    addSymbolCandidate(candidates, symbol, scriptPath);
  }

  const symbolToScriptPath = new Map<string, string>();
  for (const [symbol, paths] of candidates.entries()) {
    if (paths.size === 1) {
      symbolToScriptPath.set(symbol, [...paths][0]);
    }
  }

  return symbolToScriptPath;
}

function resolveScriptFilesFromSymbolDeclarations(
  repoRoot: string,
  declarations: UnitySymbolDeclaration[],
  scopedPaths?: string[],
): string[] {
  const allowedScriptPaths = resolveScopedScriptAllowlist(repoRoot, scopedPaths);

  const scriptFiles = declarations
    .map((declaration) => normalizeRelativePath(repoRoot, declaration.scriptPath))
    .filter((value): value is string => value !== null)
    .filter((value) => !allowedScriptPaths || allowedScriptPaths.has(value))
    .sort((left, right) => left.localeCompare(right));

  return [...new Set(scriptFiles)];
}

function resolveScopedScriptAllowlist(repoRoot: string, scopedPaths?: string[]): Set<string> | null {
  if (!scopedPaths || scopedPaths.length === 0) return null;
  const allowlist = new Set(
    scopedPaths
      .filter((value) => value.endsWith('.cs'))
      .map((value) => normalizeRelativePath(repoRoot, value))
      .filter((value): value is string => value !== null),
  );
  return allowlist.size > 0 ? allowlist : null;
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

function inferResourceType(resourcePath: string): UnityResourceGuidHit['resourceType'] {
  if (resourcePath.endsWith('.prefab')) return 'prefab';
  if (resourcePath.endsWith('.asset')) return 'asset';
  return 'scene';
}

function resolveAssetMetaFiles(
  repoRoot: string,
  scopedPaths: string[] | undefined,
  scriptFiles: string[],
  resourceFiles: string[],
): string[] {
  if (scopedPaths && scopedPaths.length > 0) {
    const scopedMeta = new Set<string>();
    for (const entry of scopedPaths) {
      const normalized = normalizeRelativePath(repoRoot, entry);
      if (!normalized) continue;
      if (normalized.endsWith('.meta')) {
        scopedMeta.add(normalized);
      } else {
        scopedMeta.add(`${normalized}.meta`);
      }
    }
    return [...scopedMeta].sort((left, right) => left.localeCompare(right));
  }

  const inferredMeta = new Set<string>();
  for (const scriptPath of scriptFiles) inferredMeta.add(`${scriptPath}.meta`);
  for (const resourcePath of resourceFiles) inferredMeta.add(`${resourcePath}.meta`);
  return [...inferredMeta].sort((left, right) => left.localeCompare(right));
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
