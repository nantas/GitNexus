import { discoverUnityResources } from './resource-discovery.js';
import type { ResourceFailure } from './resource-session.js';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { glob } from 'glob';
import { buildAssetMetaIndex, buildMetaIndex } from './meta-index.js';
import { buildUnityUiMetaIndex } from './ui-meta-index.js';
import { streamPrefabSourceRefs } from './prefab-source-scan.js';
import type { StreamPrefabSourceRefsInput } from './prefab-source-scan.js';
import type { UnityResourceGuidHit } from './resource-hit-scanner.js';
import type { UnityObjectBlock } from './yaml-object-graph.js';
import { buildSerializableTypeIndexFromFiles } from './serialized-type-index.js';
import type { UnityParitySeed } from '../ingestion/unity-parity-seed.js';

const DECLARATION_PATTERN = /\b(?:class|struct|interface)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;
const SCRIPT_GUID_IN_LINE_PATTERN = /\bm_Script\s*:\s*\{[^}]*\bguid\s*:\s*([0-9a-f]{32})\b/gi;
const RESOURCE_HIT_SCAN_CONCURRENCY = 4;

export interface BuildScanContextInput {
  repoRoot: string;
  scopedPaths?: string[];
  symbolDeclarations?: UnitySymbolDeclaration[];
  fuseResourceDiscovery?: boolean;
  resourceRecordBudgetBytes?: number;
}

export interface UnitySymbolDeclaration {
  symbol: string;
  scriptPath: string;
}

export interface UnityPrefabSourceRef {
  sourceResourcePath: string;
  targetGuid: string;
  targetResourcePath?: string;
  fileId?: string;
  fieldName: 'm_SourcePrefab';
  sourceLayer: 'scene' | 'prefab';
}

export interface UnityScanContext {
  resourceFingerprints?: Map<string, string>;
  resourceFailures?: ResourceFailure[];
  resourceAccessMetrics?: { opens: number; bytes: number; resources: number; durationMs: number; canonicalMs?: number };
  temporaryRecordMetrics?: { peakMemoryBytes: number; writtenBytes: number; readBytes: number; writeMs?: number; readMs?: number };
  close?: () => Promise<void>;
  symbolToScriptPaths: Map<string, string[]>;
  symbolToCanonicalScriptPath: Map<string, string>;
  symbolToScriptPath: Map<string, string>;
  scriptPathToGuid: Map<string, string>;
  guidToResourceHits: Map<string, UnityResourceGuidHit[]>;
  serializableSymbols: Set<string>;
  hostFieldTypeHints: Map<string, Map<string, string>>;
  assetGuidToPath?: Map<string, string>;
  uxmlGuidToPath?: Map<string, string>;
  ussGuidToPath?: Map<string, string>;
  prefabSourceRefs: UnityPrefabSourceRef[];
  streamPrefabSourceRefs: (
    options?: Pick<StreamPrefabSourceRefsInput, 'queue' | 'hooks'>,
  ) => AsyncIterable<UnityPrefabSourceRef>;
  resourceFiles: string[];
  resourceDocCache: Map<string, UnityObjectBlock[]>;
}

export async function buildUnityScanContext(input: BuildScanContextInput): Promise<UnityScanContext> {
  const scriptFiles =
    input.symbolDeclarations && input.symbolDeclarations.length > 0
      ? resolveScriptFilesFromSymbolDeclarations(input.repoRoot, input.symbolDeclarations, input.scopedPaths)
      : await resolveScriptFiles(input.repoRoot, input.scopedPaths);
  const symbolToScriptPaths =
    input.symbolDeclarations && input.symbolDeclarations.length > 0
      ? buildSymbolScriptPathIndexFromDeclarations(input.repoRoot, input.symbolDeclarations, input.scopedPaths)
      : await buildSymbolScriptPathIndex(input.repoRoot, scriptFiles);
  const serializableTypeIndex = await buildSerializableTypeIndexFromFiles(
    scriptFiles.map((scriptPath) => {
      const normalizedPath = normalizeSlashes(scriptPath);
      return {
        filePath: normalizedPath,
        read: async () => fs.readFile(path.join(input.repoRoot, normalizedPath), 'utf-8'),
      };
    }),
  );

  const metaFiles = scriptFiles.map((scriptPath) => `${scriptPath}.meta`);
  const guidToScriptPath = await buildMetaIndex(input.repoRoot, { metaFiles });
  const scriptPathToGuid = new Map<string, string>();
  for (const [guid, scriptPath] of guidToScriptPath.entries()) {
    scriptPathToGuid.set(normalizeSlashes(scriptPath), guid);
  }

  const resourceFiles = await resolveResourceFiles(input.repoRoot, input.scopedPaths);
  const normalizedResourceFiles = [...new Set(resourceFiles.map((resourcePath) => normalizeSlashes(resourcePath)))]
    .filter((resourcePath) => resourcePath.length > 0)
    .sort((left, right) => left.localeCompare(right));
  const assetMetaFiles = resolveAssetMetaFiles(
    input.repoRoot,
    input.scopedPaths,
    scriptFiles,
    normalizedResourceFiles,
  );
  const assetGuidToPath = await buildAssetMetaIndex(input.repoRoot, { metaFiles: assetMetaFiles });
  const uiMetaIndex = await buildUnityUiMetaIndex(input.repoRoot, { scopedPaths: input.scopedPaths });
  const discovery = input.fuseResourceDiscovery ? await discoverUnityResources({
    repoRoot: input.repoRoot, resourceFiles: normalizedResourceFiles,
    scriptGuids: scriptPathToGuid.values(), assetGuidToPath,
    recordBudgetBytes: input.resourceRecordBudgetBytes,
  }) : undefined;
  const guidToResourceHits = discovery?.hits
    ?? await buildGuidHitIndex(input.repoRoot, scriptPathToGuid, normalizedResourceFiles);
  const streamPrefabSourceRefsFn = (options?: Pick<StreamPrefabSourceRefsInput, 'queue' | 'hooks'>) =>
    discovery ? (async function* () {
      for (const failure of discovery.failures) options?.hooks?.onFileError?.(failure.resourcePath, new Error(failure.message));
      for await (const row of discovery.sourceRecords.records()) {
        options?.hooks?.onYield?.(row);
        yield row;
      }
    })() : streamPrefabSourceRefs({
      repoRoot: input.repoRoot,
      resourceFiles: normalizedResourceFiles,
      assetGuidToPath,
      queue: options?.queue,
      hooks: options?.hooks,
    });
  const canonicalStarted = performance.now();
  const symbolToCanonicalScriptPath = buildCanonicalScriptPathIndex(
    symbolToScriptPaths,
    scriptPathToGuid,
    guidToResourceHits,
  );
  const symbolToScriptPath = new Map<string, string>(symbolToCanonicalScriptPath);

  return {
    ...(discovery ? {
      resourceFingerprints: discovery.fingerprints,
      resourceFailures: discovery.failures,
      resourceAccessMetrics: { ...discovery.metrics, canonicalMs: performance.now() - canonicalStarted },
      temporaryRecordMetrics: discovery.sourceRecords.metrics,
      close: () => discovery.sourceRecords.close(),
    } : {}),
    symbolToScriptPaths,
    symbolToCanonicalScriptPath,
    symbolToScriptPath,
    scriptPathToGuid,
    guidToResourceHits,
    serializableSymbols: serializableTypeIndex.serializableSymbols,
    hostFieldTypeHints: serializableTypeIndex.hostFieldTypeHints,
    assetGuidToPath,
    uxmlGuidToPath: uiMetaIndex.uxmlGuidToPath,
    ussGuidToPath: uiMetaIndex.ussGuidToPath,
    prefabSourceRefs: [],
    streamPrefabSourceRefs: streamPrefabSourceRefsFn,
    resourceFiles: normalizedResourceFiles,
    resourceDocCache: new Map<string, UnityObjectBlock[]>(),
  };
}

export function buildUnityScanContextFromSeed(input: {
  seed: UnityParitySeed;
  symbolDeclarations?: UnitySymbolDeclaration[];
}): UnityScanContext {
  const seed = input.seed;
  const requestedSymbols = new Set(
    (input.symbolDeclarations || [])
      .map((entry) => String(entry.symbol || '').trim())
      .filter((value) => value.length > 0),
  );
  const requestedScripts = new Set(
    (input.symbolDeclarations || [])
      .map((entry) => normalizeSlashes(String(entry.scriptPath || '').trim()))
      .filter((value) => value.length > 0),
  );

  const symbolToScriptPath = new Map<string, string>();
  for (const [symbol, scriptPath] of Object.entries(seed.symbolToScriptPath || {})) {
    const normalizedPath = normalizeSlashes(scriptPath);
    if (!normalizedPath) continue;
    if (requestedSymbols.size > 0 && !requestedSymbols.has(symbol)) continue;
    symbolToScriptPath.set(symbol, normalizedPath);
    requestedScripts.add(normalizedPath);
  }

  if (symbolToScriptPath.size === 0 && requestedSymbols.size > 0) {
    for (const declaration of input.symbolDeclarations || []) {
      const symbol = String(declaration.symbol || '').trim();
      const scriptPath = normalizeSlashes(String(declaration.scriptPath || '').trim());
      if (!symbol || !scriptPath) continue;
      symbolToScriptPath.set(symbol, scriptPath);
      requestedScripts.add(scriptPath);
    }
  }

  const symbolToCanonicalScriptPath = new Map<string, string>(symbolToScriptPath);
  const symbolToScriptPaths = new Map<string, string[]>();
  for (const [symbol, scriptPath] of symbolToScriptPath.entries()) {
    symbolToScriptPaths.set(symbol, [scriptPath]);
  }

  const scriptPathToGuid = new Map<string, string>();
  const normalizedScriptPathToGuidEntries = Object.entries(seed.scriptPathToGuid || {})
    .map(([scriptPath, guid]) => [normalizeSlashes(scriptPath), String(guid || '').trim()] as const)
    .filter(([scriptPath, guid]) => scriptPath.length > 0 && guid.length > 0);
  for (const [scriptPath, guid] of normalizedScriptPathToGuidEntries) {
    if (requestedScripts.size > 0 && !requestedScripts.has(scriptPath)) continue;
    scriptPathToGuid.set(scriptPath, guid);
  }
  if (scriptPathToGuid.size === 0 && requestedScripts.size > 0) {
    for (const [scriptPath, guid] of normalizedScriptPathToGuidEntries) {
      if (!requestedScripts.has(scriptPath)) continue;
      scriptPathToGuid.set(scriptPath, guid);
    }
  }

  const selectedGuids = new Set<string>(scriptPathToGuid.values());
  const guidToResourceHits = new Map<string, UnityResourceGuidHit[]>();
  for (const [guid, resourcePaths] of Object.entries(seed.guidToResourcePaths || {})) {
    if (selectedGuids.size > 0 && !selectedGuids.has(guid)) continue;
    const hits = (resourcePaths || [])
      .map((resourcePathRaw) => normalizeSlashes(String(resourcePathRaw || '').trim()))
      .filter((resourcePath) => resourcePath.length > 0)
      .map((resourcePath) => ({
        resourcePath,
        resourceType: inferResourceType(resourcePath),
        line: 0,
        lineText: 'seed',
      }));
    if (hits.length > 0) {
      guidToResourceHits.set(guid, hits);
    }
  }

  const assetGuidToPath = new Map<string, string>();
  const uxmlGuidToPath = new Map<string, string>();
  const ussGuidToPath = new Map<string, string>();
  for (const [guid, assetPath] of Object.entries(seed.assetGuidToPath || {})) {
    const normalizedPath = normalizeSlashes(String(assetPath || '').trim());
    if (!guid || !normalizedPath) continue;
    assetGuidToPath.set(guid, normalizedPath);
    assetGuidToPath.set(guid.toLowerCase(), normalizedPath);
    if (normalizedPath.endsWith('.uxml')) {
      uxmlGuidToPath.set(guid, normalizedPath);
      uxmlGuidToPath.set(guid.toLowerCase(), normalizedPath);
    }
    if (normalizedPath.endsWith('.uss')) {
      ussGuidToPath.set(guid, normalizedPath);
      ussGuidToPath.set(guid.toLowerCase(), normalizedPath);
    }
  }

  const resourceFiles = [
    ...new Set(
      Object.values(seed.guidToResourcePaths || {})
        .flat()
        .map((resourcePathRaw) => normalizeSlashes(String(resourcePathRaw || '').trim()))
        .filter((resourcePath) => resourcePath.length > 0),
    ),
  ].sort((left, right) => left.localeCompare(right));

  const prefabSourceRefs = ((seed as any).prefabSourceRefs || [])
    .map((value: any) => normalizePrefabSourceRef(value))
    .filter((value: UnityPrefabSourceRef | undefined): value is UnityPrefabSourceRef => Boolean(value));
  const streamPrefabSourceRefsFn = async function* (): AsyncGenerator<UnityPrefabSourceRef> {
    for (const row of prefabSourceRefs) {
      yield { ...row };
    }
  };

  return {
    symbolToScriptPaths,
    symbolToCanonicalScriptPath,
    symbolToScriptPath,
    scriptPathToGuid,
    guidToResourceHits,
    serializableSymbols: new Set(),
    hostFieldTypeHints: new Map<string, Map<string, string>>(),
    assetGuidToPath,
    uxmlGuidToPath,
    ussGuidToPath,
    prefabSourceRefs,
    streamPrefabSourceRefs: streamPrefabSourceRefsFn,
    resourceFiles,
    resourceDocCache: new Map<string, UnityObjectBlock[]>(),
  };
}

async function buildSymbolScriptPathIndex(repoRoot: string, scriptFiles: string[]): Promise<Map<string, string[]>> {
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

  const symbolToScriptPaths = new Map<string, string[]>();
  for (const [symbol, paths] of candidates.entries()) {
    symbolToScriptPaths.set(symbol, [...paths].sort((left, right) => left.localeCompare(right)));
  }

  return symbolToScriptPaths;
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
      const resourceType = inferResourceType(resourcePath);
      const hits = new Map<string, UnityResourceGuidHit[]>();
      await scanGuidHitsInResourceFile(repoRoot, resourcePath, resourceType, guidLookup, hits);

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

async function scanGuidHitsInResourceFile(
  repoRoot: string,
  resourcePath: string,
  resourceType: UnityResourceGuidHit['resourceType'],
  guidLookup: Map<string, string>,
  hits: Map<string, UnityResourceGuidHit[]>,
): Promise<void> {
  const absolutePath = path.join(repoRoot, resourcePath);
  const stream = createReadStream(absolutePath, { encoding: 'utf-8' });
  const reader = createInterface({
    input: stream,
    crlfDelay: Infinity,
  });
  const seenGuidInResource = new Set<string>();

  let lineNumber = 0;
  try {
    for await (const line of reader) {
      lineNumber += 1;
      const seenCanonical = new Set<string>();
      SCRIPT_GUID_IN_LINE_PATTERN.lastIndex = 0;
      let match = SCRIPT_GUID_IN_LINE_PATTERN.exec(line);
      while (match) {
        const canonicalGuid = guidLookup.get(match[1].toLowerCase());
        if (canonicalGuid && !seenCanonical.has(canonicalGuid) && !seenGuidInResource.has(canonicalGuid)) {
          seenCanonical.add(canonicalGuid);
          seenGuidInResource.add(canonicalGuid);
          const existing = hits.get(canonicalGuid) || [];
          existing.push({
            resourcePath,
            resourceType,
            line: lineNumber,
            lineText: line,
          });
          hits.set(canonicalGuid, existing);
        }
        match = SCRIPT_GUID_IN_LINE_PATTERN.exec(line);
      }
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'EISDIR') {
      return;
    }
    throw error;
  } finally {
    reader.close();
    stream.destroy();
  }
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
): Map<string, string[]> {
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

  const symbolToScriptPaths = new Map<string, string[]>();
  for (const [symbol, paths] of candidates.entries()) {
    symbolToScriptPaths.set(symbol, [...paths].sort((left, right) => left.localeCompare(right)));
  }

  return symbolToScriptPaths;
}

function buildCanonicalScriptPathIndex(
  symbolToScriptPaths: Map<string, string[]>,
  scriptPathToGuid: Map<string, string>,
  guidToResourceHits: Map<string, UnityResourceGuidHit[]>,
): Map<string, string> {
  const canonical = new Map<string, string>();
  for (const [symbol, scriptPaths] of symbolToScriptPaths.entries()) {
    if (scriptPaths.length === 0) continue;
    const selected = selectCanonicalScriptPath(symbol, scriptPaths, scriptPathToGuid, guidToResourceHits);
    if (selected) {
      canonical.set(symbol, selected);
    }
  }
  return canonical;
}

function selectCanonicalScriptPath(
  symbol: string,
  scriptPaths: string[],
  scriptPathToGuid: Map<string, string>,
  guidToResourceHits: Map<string, UnityResourceGuidHit[]>,
): string | null {
  const uniquePaths = [...new Set(scriptPaths)].sort((left, right) => left.localeCompare(right));
  if (uniquePaths.length === 0) return null;
  const symbolBaseName = `${symbol}.cs`.toLowerCase();
  const symbolPrefix = `${symbol.toLowerCase()}.`;

  const scored = uniquePaths.map((scriptPath) => {
    const baseName = path.basename(scriptPath).toLowerCase();
    const exactScore = baseName === symbolBaseName ? 0 : 1;
    const generatedScore = baseName.endsWith('.generated.cs') ? 1 : 0;
    const suffixScore = baseName.startsWith(symbolPrefix) && baseName !== symbolBaseName ? 1 : 0;
    const guid = scriptPathToGuid.get(scriptPath);
    const hitCount = guid ? (guidToResourceHits.get(guid)?.length || 0) : 0;
    return {
      scriptPath,
      exactScore,
      generatedScore,
      suffixScore,
      hitCount,
    };
  });

  scored.sort((left, right) => {
    if (left.exactScore !== right.exactScore) return left.exactScore - right.exactScore;
    if (left.generatedScore !== right.generatedScore) return left.generatedScore - right.generatedScore;
    if (left.suffixScore !== right.suffixScore) return left.suffixScore - right.suffixScore;
    if (left.hitCount !== right.hitCount) return right.hitCount - left.hitCount;
    return left.scriptPath.localeCompare(right.scriptPath);
  });

  return scored[0].scriptPath;
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

function normalizePrefabSourceRef(value: any): UnityPrefabSourceRef | undefined {
  const sourceResourcePath = normalizeSlashes(String(value?.sourceResourcePath || '').trim());
  const targetGuid = String(value?.targetGuid || '').trim().toLowerCase();
  const targetResourcePath = normalizeSlashes(String(value?.targetResourcePath || '').trim());
  const fileId = String(value?.fileId || '').trim();
  if (!sourceResourcePath || !targetGuid) return undefined;

  const sourceLayer = value?.sourceLayer === 'scene' ? 'scene' : value?.sourceLayer === 'prefab' ? 'prefab' : (
    sourceResourcePath.endsWith('.unity') ? 'scene' : 'prefab'
  );

  return {
    sourceResourcePath,
    targetGuid,
    targetResourcePath: targetResourcePath || undefined,
    fileId: fileId || undefined,
    fieldName: 'm_SourcePrefab',
    sourceLayer,
  };
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
