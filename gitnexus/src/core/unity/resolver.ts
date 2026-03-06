import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import { buildMetaIndex } from './meta-index.js';
import type { MergedUnityComponent, UnityObjectLayer } from './override-merger.js';
import { mergeOverrideChain } from './override-merger.js';
import { findGuidHits, type UnityResourceGuidHit } from './resource-hit-scanner.js';
import type { UnityScanContext } from './scan-context.js';
import { parseUnityYamlObjects, type UnityObjectBlock } from './yaml-object-graph.js';

export type UnityBindingKind = 'direct' | 'prefab-instance' | 'nested' | 'variant' | 'scene-override';

export interface ResolveInput {
  repoRoot: string;
  symbol: string;
  scanContext?: UnityScanContext;
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

export interface UnityBindingEvidence {
  line: number;
  lineText: string;
}

export interface ResolvedUnityBinding {
  resourcePath: string;
  resourceType: 'prefab' | 'scene';
  bindingKind: UnityBindingKind;
  componentObjectId: string;
  evidence: UnityBindingEvidence;
  serializedFields: UnitySerializedFields;
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
  const hits = input.scanContext
    ? (input.scanContext.guidToResourceHits.get(scriptGuid) ?? [])
    : await findGuidHits(input.repoRoot, scriptGuid);
  const resourceBindings: ResolvedUnityBinding[] = [];
  const unityDiagnostics: string[] = [];

  for (const hit of hits) {
    const blocks = await getResourceBlocks(input.repoRoot, hit.resourcePath, input.scanContext);
    const matchedComponents = blocks.filter(
      (block) => block.objectType === 'MonoBehaviour' && block.fields.m_Script?.includes(scriptGuid),
    );

    if (matchedComponents.length === 0) {
      unityDiagnostics.push(`No MonoBehaviour block matched script guid ${scriptGuid} in ${hit.resourcePath}.`);
      continue;
    }

    for (const block of matchedComponents) {
      const resolved = resolveBindingForComponent(block, blocks, hit);
      resourceBindings.push({
        resourcePath: hit.resourcePath,
        resourceType: hit.resourceType,
        bindingKind: resolved.bindingKind,
        componentObjectId: block.objectId,
        evidence: {
          line: hit.line,
          lineText: hit.lineText,
        },
        serializedFields: resolved.serializedFields,
      });
    }
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
): Promise<UnityObjectBlock[]> {
  const normalizedResourcePath = normalizePath(resourcePath);
  const cached = scanContext?.resourceDocCache.get(normalizedResourcePath);
  if (cached) {
    return cached;
  }

  const absoluteResourcePath = path.join(repoRoot, normalizedResourcePath);
  const raw = await fs.readFile(absoluteResourcePath, 'utf-8');
  const blocks = parseUnityYamlObjects(raw);
  scanContext?.resourceDocCache.set(normalizedResourcePath, blocks);
  return blocks;
}

function resolveBindingForComponent(
  componentBlock: UnityObjectBlock,
  blocks: UnityObjectBlock[],
  hit: UnityResourceGuidHit,
): { bindingKind: UnityBindingKind; serializedFields: UnitySerializedFields } {
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

function aggregateSerializedFields(resourceBindings: ResolvedUnityBinding[]): UnitySerializedFields {
  return {
    scalarFields: resourceBindings.flatMap((binding) => binding.serializedFields.scalarFields),
    referenceFields: resourceBindings.flatMap((binding) => binding.serializedFields.referenceFields),
  };
}

function inferBindingKind(componentBlock: UnityObjectBlock, resourceType: 'prefab' | 'scene'): UnityBindingKind {
  if (componentBlock.stripped && resourceType === 'scene') return 'scene-override';
  if (componentBlock.stripped) return 'nested';
  if (componentBlock.fields.m_PrefabInstance) return 'prefab-instance';
  return 'direct';
}

function baseLayerName(resourceType: 'prefab' | 'scene'): string {
  return resourceType === 'scene' ? 'scene' : 'prefab';
}

function extractFileId(rawValue?: string): string | undefined {
  if (!rawValue) return undefined;
  return rawValue.match(/fileID:\s*(\d+)/)?.[1];
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
