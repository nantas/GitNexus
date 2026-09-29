import type { ResourceCosts } from './resource-costs.js';
import { resourceLines } from './resource-lines.js';
import { ResourceRecordStore, ResourceStorageError } from './resource-record-store.js';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { buildMetaIndex } from './meta-index.js';
import type { MergedUnityComponent, UnityObjectLayer } from './override-merger.js';
import { mergeOverrideChain } from './override-merger.js';
import { findGuidHits, type UnityResourceGuidHit } from './resource-hit-scanner.js';
import type { UnityScanContext } from './scan-context.js';
import { parseUnityYamlObjects, type UnityObjectBlock, type UnityObjectType } from './yaml-object-graph.js';

export type UnityBindingKind = 'direct' | 'prefab-instance' | 'nested' | 'variant' | 'scene-override';
const MAX_CACHED_RESOURCE_BYTES = 512 * 1024;

export interface ResolveInput {
  repoRoot: string;
  symbol: string;
  scanContext?: UnityScanContext;
  resourcePathAllowlist?: string[];
  deepParseLargeResources?: boolean;
}

export interface UnityScalarField {
  name: string;
  value: string;
  valueType?: string;
  sourceLayer: string;
}

export interface UnityReferenceField {
  name: string;
  fileId?: string;
  guid?: string;
  resolvedAssetPath?: string;
  sourceLayer: string;
}

export interface UnitySerializedFields {
  scalarFields: UnityScalarField[];
  referenceFields: UnityReferenceField[];
}

export type UnityReferenceResolution = 'null' | 'local-object' | 'external-asset' | 'unresolved';

export interface UnityResolvedReferenceTarget {
  resourcePath?: string;
  objectId?: string;
  objectType?: UnityObjectType | string;
  gameObjectName?: string;
  assetPath?: string;
}

export interface UnityResolvedReference {
  fieldName: string;
  sourceLayer: string;
  fileId?: string;
  guid?: string;
  fromList: boolean;
  listIndex?: number;
  resolution: UnityReferenceResolution;
  target?: UnityResolvedReferenceTarget;
}

export interface UnityBindingEvidence {
  line: number;
  lineText: string;
}

export interface UnityAssetRefPathReference {
  parentFieldName: string;
  fieldName: string;
  relativePath: string;
  sourceLayer: string;
  isEmpty: boolean;
  isSprite: boolean;
}

export interface ResolvedUnityBinding {
  resourcePath: string;
  resourceType: 'prefab' | 'scene' | 'asset';
  bindingKind: UnityBindingKind;
  componentObjectId: string;
  lightweight?: boolean;
  evidence: UnityBindingEvidence;
  serializedFields: UnitySerializedFields;
  resolvedReferences: UnityResolvedReference[];
  assetRefPaths?: UnityAssetRefPathReference[];
}

export interface ResolveOutput {
  symbol: string;
  scriptPath: string;
  scriptGuid: string;
  resourceBindings: ResolvedUnityBinding[];
  serializedFields: UnitySerializedFields;
  unityDiagnostics: string[];
}

export async function resolveUnityBindings(input: ResolveInput): Promise<ResolveOutput> {
  const scriptPath = await resolveSymbolScriptPath(input.repoRoot, input.symbol, input.scanContext);
  const scriptGuid = await resolveScriptGuid(input.repoRoot, scriptPath, input.scanContext);
  const rawHits = input.scanContext
    ? (input.scanContext.guidToResourceHits.get(scriptGuid) ?? [])
    : await findGuidHits(input.repoRoot, scriptGuid);
  const hits = applyResourceAllowlist(rawHits, input.resourcePathAllowlist);
  const resourceBindings: ResolvedUnityBinding[] = [];
  const unityDiagnostics: string[] = [];
  const uniqueHits = new Map(hits.map(hit => [normalizePath(hit.resourcePath), hit]));
  for (const hit of uniqueHits.values()) {
    let matched = false;
    for await (const { binding } of resolveResourceBindings({
      repoRoot: input.repoRoot, hit, scriptGuids: [scriptGuid],
      scanContext: input.scanContext, deepParseLargeResources: input.deepParseLargeResources,
    })) {
      matched = true;
      resourceBindings.push(binding);
    }
    if (!matched) unityDiagnostics.push(`No MonoBehaviour block matched script guid ${scriptGuid} in ${hit.resourcePath}.`);
  }

  return {
    symbol: input.symbol,
    scriptPath,
    scriptGuid,
    resourceBindings,
    serializedFields: aggregateSerializedFields(resourceBindings),
    unityDiagnostics,
  };
}

export interface ResourceBindingFact {
  scriptGuid: string;
  binding: ResolvedUnityBinding;
  /** Consume before advancing the resource iterator; records belong to this component. */
  referenceRecords?: AsyncIterable<UnityResolvedReference>;
}

/** Resource-oriented parser shared by analyze and selected query hydration. */
export async function* resolveResourceBindings(input: {
  repoRoot: string;
  hit: UnityResourceGuidHit;
  scriptGuids: readonly string[];
  scanContext?: UnityScanContext;
  assetGuidToPath?: Map<string, string>;
  referenceBudgetBytes?: number;
  costs?: ResourceCosts;
  signal?: AbortSignal;
  deepParseLargeResources?: boolean;
}): AsyncGenerator<ResourceBindingFact> {
  const { hit } = input;
  const selected = new Set(input.scriptGuids.map(guid => guid.toLowerCase()));
  const assetGuidToPath = input.assetGuidToPath ?? input.scanContext?.assetGuidToPath;
  if (!input.deepParseLargeResources && await isLargeResourceForDeepParse(input.repoRoot, hit.resourcePath, new Map())) {
    yield* createLightweightBindings(input.repoRoot, hit, selected, assetGuidToPath, input.referenceBudgetBytes, input.costs, input.signal);
    return;
  }
  const boundedRead = input.referenceBudgetBytes !== undefined && !input.deepParseLargeResources;
  if (input.costs && !input.scanContext?.resourceDocCache.has(normalizePath(hit.resourcePath))) {
    input.costs.opens++;
    input.costs.parses++;
    if (!boundedRead) input.costs.bytes += (await fs.stat(path.join(input.repoRoot, hit.resourcePath))).size;
  }
  const blocks = await getResourceBlocks(input.repoRoot, hit.resourcePath, input.scanContext,
    boundedRead ? { maxBytes: MAX_CACHED_RESOURCE_BYTES, signal: input.signal, costs: input.costs } : undefined);
  for (const block of blocks) {
    if (block.objectType !== 'MonoBehaviour') continue;
    const scriptGuid = extractGuidFromScriptField(block.fields.m_Script || '')?.toLowerCase();
    if (!scriptGuid || !selected.has(scriptGuid)) continue;
    const resolved = resolveBindingForComponent(block, blocks, hit, { assetGuidToPath });
    yield { scriptGuid, binding: {
      resourcePath: hit.resourcePath,
      resourceType: hit.resourceType,
      bindingKind: resolved.bindingKind,
      componentObjectId: block.objectId,
      evidence: block.scriptEvidence ?? { line: hit.line, lineText: hit.lineText },
      serializedFields: resolved.serializedFields,
      resolvedReferences: resolved.resolvedReferences,
      assetRefPaths: extractAssetRefPathReferences(resolved.serializedFields),
    } };
  }
}

function applyResourceAllowlist(
  hits: UnityResourceGuidHit[],
  allowlist?: string[],
): UnityResourceGuidHit[] {
  if (!allowlist || allowlist.length === 0) {
    return hits;
  }

  const normalizedAllowlist = new Set(allowlist.map((value) => normalizePath(value)));
  return hits.filter((hit) => normalizedAllowlist.has(normalizePath(hit.resourcePath)));
}

/** Extract only external GUID fields from large MonoBehaviour blocks, without retaining YAML bodies. */
async function* createLightweightBindings(
  repoRoot: string,
  hit: UnityResourceGuidHit,
  selectedGuids: ReadonlySet<string>,
  assetGuidToPath?: Map<string, string>,
  referenceBudgetBytes?: number,
  costs?: ResourceCosts,
  signal?: AbortSignal,
): AsyncGenerator<ResourceBindingFact> {
  if (costs) { costs.opens++; costs.parses++; }
  const reader = resourceLines(path.join(repoRoot, normalizePath(hit.resourcePath)), undefined,
    bytes => { if (costs) costs.bytes += bytes; }, signal);
  let referenceStore: ResourceRecordStore<UnityResolvedReference> | undefined;
  const appendReference = async (reference: UnityResolvedReference) => {
    if (referenceBudgetBytes === undefined) references.push(reference);
    else {
      referenceStore ??= new ResourceRecordStore<UnityResolvedReference>(referenceBudgetBytes);
      await referenceStore.append(reference);
      if (costs) costs.peakRecordBytes = Math.max(costs.peakRecordBytes, referenceStore.metrics.peakMemoryBytes);
    }
  };
  const releaseReferences = async () => {
    if (!referenceStore) return;
    const store = referenceStore;
    referenceStore = undefined;
    if (costs) {
      costs.spillWrittenBytes += store.metrics.writtenBytes;
      costs.spillReadBytes += store.metrics.readBytes;
      costs.spillWriteMs += store.metrics.writeMs;
      costs.spillReadMs += store.metrics.readMs;
    }
    await store.close();
  };
  let objectId: string | undefined;
  let stripped = false;
  let inMonoBehaviour = false;
  let matchedGuid: string | undefined;
  let fieldName: string | undefined;
  let listIndex = 0;
  let references: UnityResolvedReference[] = [];
  let lineNumber = 0;
  let evidence: UnityBindingEvidence = { line: hit.line, lineText: hit.lineText };

  const flush = () => {
    if (!inMonoBehaviour || !matchedGuid || !objectId) return;
    return { scriptGuid: matchedGuid, referenceRecords: referenceStore?.records(), binding: {
      resourcePath: hit.resourcePath,
      resourceType: hit.resourceType,
      bindingKind: stripped ? (hit.resourceType === 'scene' ? 'scene-override' : 'nested')
        : (hit.resourceType === 'scene' ? 'scene-override' : 'direct'),
      componentObjectId: objectId,
      lightweight: true,
      evidence,
      serializedFields: { scalarFields: [], referenceFields: [] },
      resolvedReferences: references,
      assetRefPaths: [],
    } as ResolvedUnityBinding };
  };

  let failure: unknown;
  try {
    for await (const line of reader) {
      lineNumber += 1;
      const header = line.match(/^--- !u!\d+ &(-?\d+)(?:\s+(\w+))?\s*$/);
      if (header) {
        const previous = flush();
        if (previous) yield previous;
        await releaseReferences();
        objectId = header[1];
        stripped = header[2] === 'stripped';
        inMonoBehaviour = false;
        matchedGuid = undefined;
        fieldName = undefined;
        references = [];
        continue;
      }
      if (!objectId) continue;
      if (/^MonoBehaviour:\s*$/.test(line)) {
        inMonoBehaviour = true;
        continue;
      }
      if (!inMonoBehaviour) continue;

      const field = line.match(/^ {2}(?!-)([^ ][^:]*):(.*)$/);
      if (field) {
        fieldName = field[1].trim();
        listIndex = 0;
        const value = field[2].trim();
        if (fieldName === 'm_Script') {
          const guid = extractGuidFromScriptField(value)?.toLowerCase();
          matchedGuid = guid && selectedGuids.has(guid) ? guid : undefined;
          evidence = { line: lineNumber, lineText: line };
        } else if (!fieldName.startsWith('m_')) {
          const ref = parseObjectReference(value);
          if (ref?.guid) {
            await appendReference(resolveReferenceCandidate({
              fieldName, sourceLayer: baseLayerName(hit.resourceType),
              fileId: ref.fileId, guid: ref.guid, fromList: false,
            }, new Map(), hit.resourcePath, assetGuidToPath));
          }
        }
        continue;
      }

      if (!fieldName || fieldName.startsWith('m_')) continue;
      const listRef = line.match(/^ {4}-\s*(\{[^\n]*\})\s*$/);
      if (!listRef) continue;
      const ref = parseObjectReference(listRef[1]);
      if (!ref?.guid) continue;
      await appendReference(resolveReferenceCandidate({
        fieldName, sourceLayer: baseLayerName(hit.resourceType),
        fileId: ref.fileId, guid: ref.guid, fromList: true, listIndex: listIndex++,
      }, new Map(), hit.resourcePath, assetGuidToPath));
    }
    const last = flush();
    if (last) yield last;
  } catch (error) { failure = error; throw error; }
  finally {
    const errors: unknown[] = [];
    try { await reader.return(undefined); } catch (error) { errors.push(error); }
    try { await releaseReferences(); } catch (error) { errors.push(error); }
    if (errors.length) {
      if (failure !== undefined) errors.unshift(failure);
      throw new ResourceStorageError('Unity resolution cleanup failed.', new AggregateError(errors));
    }
  }
}

async function isLargeResourceForDeepParse(
  repoRoot: string,
  resourcePath: string,
  cache: Map<string, boolean>,
): Promise<boolean> {
  const normalizedPath = normalizePath(resourcePath);
  const cached = cache.get(normalizedPath);
  if (cached !== undefined) {
    return cached;
  }

  const absolutePath = path.join(repoRoot, normalizedPath);
  const stat = await fs.stat(absolutePath);
  const isLarge = stat.size > MAX_CACHED_RESOURCE_BYTES;
  cache.set(normalizedPath, isLarge);
  return isLarge;
}

export function hasCoverage(resultSet: ResolveOutput[]): { hasScalar: boolean; hasReference: boolean } {
  return {
    hasScalar: resultSet.some((result) => result.serializedFields.scalarFields.length > 0),
    hasReference: resultSet.some((result) => result.serializedFields.referenceFields.length > 0),
  };
}

async function resolveSymbolScriptPath(repoRoot: string, symbol: string, scanContext?: UnityScanContext): Promise<string> {
  const contextHit = scanContext?.symbolToScriptPath.get(symbol);
  if (contextHit) {
    return normalizePath(contextHit);
  }

  const scriptFiles = (await glob('**/*.cs', {
    cwd: repoRoot,
    nodir: true,
    dot: false,
  })).sort((left, right) => left.localeCompare(right));

  const basenameMatches = scriptFiles.filter((filePath) => path.basename(filePath, '.cs') === symbol);
  if (basenameMatches.length === 1) {
    return normalizePath(basenameMatches[0]);
  }

  const symbolRegex = new RegExp(`\\b(class|struct|interface)\\s+${escapeRegex(symbol)}\\b`);
  const contentMatches: string[] = [];
  for (const filePath of scriptFiles) {
    const content = await fs.readFile(path.join(repoRoot, filePath), 'utf-8');
    if (symbolRegex.test(content)) {
      contentMatches.push(normalizePath(filePath));
    }
  }

  if (contentMatches.length === 1) {
    return contentMatches[0];
  }

  if (contentMatches.length > 1 || basenameMatches.length > 1) {
    throw new Error(`Unity symbol "${symbol}" is ambiguous.`);
  }

  throw new Error(`Unity symbol "${symbol}" was not found under ${repoRoot}.`);
}

async function resolveScriptGuid(repoRoot: string, scriptPath: string, scanContext?: UnityScanContext): Promise<string> {
  const contextGuid = scanContext?.scriptPathToGuid.get(normalizePath(scriptPath));
  if (contextGuid) {
    return contextGuid;
  }

  const metaIndex = await buildMetaIndex(repoRoot);
  for (const [guid, indexedScriptPath] of metaIndex.entries()) {
    if (normalizePath(indexedScriptPath) === normalizePath(scriptPath)) {
      return guid;
    }
  }

  throw new Error(`No .meta guid found for ${scriptPath}.`);
}

async function getResourceBlocks(
  repoRoot: string,
  resourcePath: string,
  scanContext?: UnityScanContext,
  boundedRead?: { maxBytes: number; signal?: AbortSignal; costs?: ResourceCosts },
): Promise<UnityObjectBlock[]> {
  const normalizedResourcePath = normalizePath(resourcePath);
  const cached = scanContext?.resourceDocCache.get(normalizedResourcePath);
  if (cached) {
    return cached;
  }

  const absoluteResourcePath = path.join(repoRoot, normalizedResourcePath);
  let allowCache = Boolean(scanContext);
  if (allowCache) {
    const stat = await fs.stat(absoluteResourcePath);
    allowCache = stat.size <= MAX_CACHED_RESOURCE_BYTES;
  }
  let raw: string;
  if (boundedRead) {
    // Enforce the small branch's bound even if the file grows after stat().
    const stream = createReadStream(absoluteResourcePath, { highWaterMark: 64 * 1024, signal: boundedRead.signal });
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      for await (const chunk of stream) {
        bytes += chunk.length;
        if (boundedRead.costs) boundedRead.costs.bytes += chunk.length;
        if (bytes > boundedRead.maxBytes) throw new Error('Resource grew beyond the small-parser input budget.');
        chunks.push(chunk);
      }
      raw = Buffer.concat(chunks).toString('utf8');
    } finally { stream.destroy(); }
  } else raw = await fs.readFile(absoluteResourcePath, 'utf-8');
  const blocks = parseUnityYamlObjects(raw);
  if (allowCache) {
    scanContext?.resourceDocCache.set(normalizedResourcePath, blocks);
  }
  return blocks;
}

function resolveBindingForComponent(
  componentBlock: UnityObjectBlock,
  blocks: UnityObjectBlock[],
  hit: UnityResourceGuidHit,
  scanContext?: Pick<UnityScanContext, 'assetGuidToPath'>,
): { bindingKind: UnityBindingKind; serializedFields: UnitySerializedFields; resolvedReferences: UnityResolvedReference[] } {
  const directLayer = createLayerFromFields(componentBlock.fields, baseLayerName(hit.resourceType));
  const layers: UnityObjectLayer[] = [directLayer];
  let bindingKind: UnityBindingKind = inferBindingKind(componentBlock, hit.resourceType);

  const prefabInstanceId = extractFileId(componentBlock.fields.m_PrefabInstance);
  if (prefabInstanceId) {
    const prefabInstanceBlock = blocks.find(
      (block) => block.objectType === 'PrefabInstance' && block.objectId === prefabInstanceId,
    );

    if (prefabInstanceBlock?.fields.m_Modification) {
      const modificationLayer = createLayerFromModification(
        prefabInstanceBlock.fields.m_Modification,
        componentBlock.objectId,
        hit.resourceType === 'scene' ? 'scene' : 'prefab-instance',
      );

      if (modificationLayer) {
        layers.push(modificationLayer);
        if (hit.resourceType === 'scene') {
          bindingKind = 'scene-override';
        }
      }
    }
  }

  const merged = mergeOverrideChain(layers);
  return {
    bindingKind,
    serializedFields: toSerializedFields(merged),
    resolvedReferences: toResolvedReferences(merged, blocks, hit.resourcePath, scanContext?.assetGuidToPath),
  };
}

function createLayerFromFields(fields: Record<string, string>, sourceLayer: string): UnityObjectLayer {
  const scalarFields: NonNullable<UnityObjectLayer['scalarFields']> = {};
  const referenceFields: NonNullable<UnityObjectLayer['referenceFields']> = {};

  for (const [name, rawValue] of Object.entries(fields)) {
    if (name.startsWith('m_')) continue;

    const reference = parseObjectReference(rawValue);
    if (reference) {
      referenceFields[name] = reference;
      continue;
    }

    scalarFields[name] = {
      value: rawValue.trim(),
      valueType: inferValueType(rawValue),
    };
  }

  return { sourceLayer, scalarFields, referenceFields };
}

function createLayerFromModification(
  modificationBody: string,
  targetObjectId: string,
  sourceLayer: string,
): UnityObjectLayer | null {
  const scalarFields: NonNullable<UnityObjectLayer['scalarFields']> = {};
  const referenceFields: NonNullable<UnityObjectLayer['referenceFields']> = {};
  const entryPattern =
    /-\s*target:\s*\{fileID:\s*(\d+)[^}]*\}\s*\n\s*propertyPath:\s*([^\n]+)\s*\n\s*value:\s*([^\n]*)\s*\n\s*objectReference:\s*(\{[^\n]*\})/g;

  let match: RegExpExecArray | null = entryPattern.exec(modificationBody);
  while (match) {
    const [, fileId, propertyPath, rawValue, rawObjectReference] = match;
    if (fileId === targetObjectId && !propertyPath.startsWith('m_')) {
      const normalizedValue = rawValue.trim();
      if (normalizedValue.length > 0) {
        scalarFields[propertyPath] = {
          value: normalizedValue,
          valueType: inferValueType(normalizedValue),
        };
      } else {
        const reference = parseObjectReference(rawObjectReference);
        if (reference) {
          referenceFields[propertyPath] = reference;
        }
      }
    }

    match = entryPattern.exec(modificationBody);
  }

  if (Object.keys(scalarFields).length === 0 && Object.keys(referenceFields).length === 0) {
    return null;
  }

  return { sourceLayer, scalarFields, referenceFields };
}

function toSerializedFields(merged: MergedUnityComponent): UnitySerializedFields {
  return {
    scalarFields: Object.values(merged.scalarFields).sort((left, right) => left.name.localeCompare(right.name)),
    referenceFields: Object.values(merged.referenceFields).sort((left, right) => left.name.localeCompare(right.name)),
  };
}

const ASSET_REF_FIELD_RE = /^\s*([A-Za-z0-9_]*Ref):\s*$/;
const RELATIVE_PATH_RE = /^\s*_relativePath:\s*(.*)$/;

function unquote(value: string): string {
  return value.replace(/^"|"$/g, '');
}

function isSpriteRelativePath(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes('/sprites/')) return true;
  return /\.(png|jpg|jpeg|tga|psd|webp|spriteatlas|spriteatlasv2)$/.test(normalized);
}

export function extractAssetRefPathReferences(serializedFields: UnitySerializedFields): UnityAssetRefPathReference[] {
  const refs: UnityAssetRefPathReference[] = [];
  for (const scalarField of serializedFields.scalarFields) {
    const text = String(scalarField.value || '');
    if (!text) continue;

    let currentFieldName = scalarField.name;
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const fieldMatch = line.match(ASSET_REF_FIELD_RE);
      if (fieldMatch) {
        currentFieldName = fieldMatch[1];
        continue;
      }
      const relativeMatch = line.match(RELATIVE_PATH_RE);
      if (!relativeMatch) {
        continue;
      }
      const relativePath = unquote((relativeMatch[1] || '').trim());
      refs.push({
        parentFieldName: scalarField.name,
        fieldName: currentFieldName,
        relativePath,
        sourceLayer: scalarField.sourceLayer || 'unknown',
        isEmpty: relativePath.length === 0,
        isSprite: isSpriteRelativePath(relativePath),
      });
    }
  }

  return refs;
}

function aggregateSerializedFields(resourceBindings: ResolvedUnityBinding[]): UnitySerializedFields {
  return {
    scalarFields: resourceBindings.flatMap((binding) => binding.serializedFields.scalarFields),
    referenceFields: resourceBindings.flatMap((binding) => binding.serializedFields.referenceFields),
  };
}

function toResolvedReferences(
  merged: MergedUnityComponent,
  blocks: UnityObjectBlock[],
  resourcePath: string,
  assetGuidToPath?: Map<string, string>,
): UnityResolvedReference[] {
  const references: UnityResolvedReference[] = [];
  const blocksById = new Map<string, UnityObjectBlock>();
  for (const block of blocks) {
    blocksById.set(block.objectId, block);
  }

  for (const reference of Object.values(merged.referenceFields)) {
    references.push(
      resolveReferenceCandidate(
        {
          fieldName: reference.name,
          sourceLayer: reference.sourceLayer,
          fileId: reference.fileId,
          guid: reference.guid,
          fromList: false,
        },
        blocksById,
        resourcePath,
        assetGuidToPath,
      ),
    );
  }

  for (const scalar of Object.values(merged.scalarFields)) {
    const candidates = parseListReferenceCandidates(scalar.name, scalar.sourceLayer, scalar.value);
    references.push(
      ...candidates.map((candidate) =>
        resolveReferenceCandidate(candidate, blocksById, resourcePath, assetGuidToPath),
      ),
    );
  }

  return references;
}

type UnityReferenceCandidate = Pick<UnityResolvedReference, 'fieldName' | 'sourceLayer' | 'fileId' | 'guid' | 'fromList' | 'listIndex'>;

function parseListReferenceCandidates(fieldName: string, sourceLayer: string, rawValue: string): UnityReferenceCandidate[] {
  const trimmed = rawValue.trim();
  if (!trimmed.startsWith('-')) return [];

  const candidates: UnityReferenceCandidate[] = [];
  const lines = trimmed.split(/\r?\n/);
  let listIndex = 0;
  for (const line of lines) {
    const lineTrimmed = line.trim();
    if (!lineTrimmed.startsWith('-')) continue;
    const entryMatch = lineTrimmed.match(/^-\s*(\{.*\})\s*$/);
    if (!entryMatch) continue;
    const parsed = parseObjectReference(entryMatch[1]);
    if (!parsed) continue;

    candidates.push({
      fieldName,
      sourceLayer,
      fileId: parsed.fileId,
      guid: parsed.guid,
      fromList: true,
      listIndex,
    });
    listIndex += 1;
  }
  return candidates;
}

function resolveReferenceCandidate(
  candidate: UnityReferenceCandidate,
  blocksById: Map<string, UnityObjectBlock>,
  resourcePath: string,
  assetGuidToPath?: Map<string, string>,
): UnityResolvedReference {
  const fileId = candidate.fileId;
  const guid = candidate.guid;
  const normalizedGuid = guid ? guid.toLowerCase() : undefined;

  if (fileId === '0') {
    return {
      ...candidate,
      resolution: 'null',
    };
  }

  if (normalizedGuid && !isBuiltInGuid(normalizedGuid)) {
    const assetPath = assetGuidToPath?.get(normalizedGuid) || assetGuidToPath?.get(guid!);
    return {
      ...candidate,
      resolution: assetPath ? 'external-asset' : 'unresolved',
      target: assetPath ? { assetPath } : undefined,
    };
  }

  if (fileId) {
    const targetBlock = blocksById.get(fileId);
    if (targetBlock) {
      return {
        ...candidate,
        resolution: 'local-object',
        target: {
          resourcePath,
          objectId: targetBlock.objectId,
          objectType: targetBlock.objectType,
          gameObjectName: resolveGameObjectName(targetBlock, blocksById),
        },
      };
    }
  }

  return {
    ...candidate,
    resolution: 'unresolved',
  };
}

function resolveGameObjectName(block: UnityObjectBlock, blocksById: Map<string, UnityObjectBlock>): string | undefined {
  if (block.objectType === 'GameObject') {
    return block.fields.m_Name?.trim() || undefined;
  }

  const gameObjectRef = parseObjectReference(block.fields.m_GameObject || '');
  const gameObjectId = gameObjectRef?.fileId;
  if (!gameObjectId) return undefined;
  const gameObjectBlock = blocksById.get(gameObjectId);
  if (!gameObjectBlock || gameObjectBlock.objectType !== 'GameObject') return undefined;
  return gameObjectBlock.fields.m_Name?.trim() || undefined;
}

function isBuiltInGuid(guid: string): boolean {
  return /^0+$/.test(guid);
}

function inferBindingKind(componentBlock: UnityObjectBlock, resourceType: 'prefab' | 'scene' | 'asset'): UnityBindingKind {
  if (componentBlock.stripped && resourceType === 'scene') return 'scene-override';
  if (componentBlock.stripped) return 'nested';
  if (componentBlock.fields.m_PrefabInstance) return 'prefab-instance';
  return 'direct';
}

function baseLayerName(resourceType: 'prefab' | 'scene' | 'asset'): string {
  if (resourceType === 'scene') return 'scene';
  if (resourceType === 'asset') return 'asset';
  return 'prefab';
}

function extractFileId(rawValue?: string): string | undefined {
  if (!rawValue) return undefined;
  return rawValue.match(/fileID:\s*(\d+)/)?.[1];
}

function extractGuidFromScriptField(rawValue: string): string | undefined {
  return rawValue.match(/guid:\s*([0-9a-f]{32})/i)?.[1];
}

function parseObjectReference(rawValue: string): { fileId?: string; guid?: string; resolvedAssetPath?: string } | null {
  const trimmed = rawValue.trim();
  if (!trimmed.startsWith('{') || !trimmed.includes('fileID:')) {
    return null;
  }

  const fileId = trimmed.match(/fileID:\s*(-?\d+)/)?.[1];
  const guid = trimmed.match(/guid:\s*([0-9a-f]{32})/i)?.[1];
  return { fileId, guid };
}

function inferValueType(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return 'number';
  if (/^(true|false)$/i.test(trimmed)) return 'boolean';
  return 'string';
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
