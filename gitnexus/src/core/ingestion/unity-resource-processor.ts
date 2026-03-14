import { performance } from 'node:perf_hooks';
import { generateId } from '../../lib/utils.js';
import type { KnowledgeGraph, GraphNode, GraphRelationship } from '../graph/types.js';
import type { UnityScanContext, UnitySymbolDeclaration } from '../unity/scan-context.js';
import { buildUnityScanContext } from '../unity/scan-context.js';
import { resolveUnityBindings } from '../unity/resolver.js';

export interface UnityResourceProcessingResult {
  processedSymbols: number;
  bindingCount: number;
  componentCount: number;
  diagnostics: string[];
  timingsMs: {
    scanContext: number;
    resolve: number;
    graphWrite: number;
    total: number;
  };
}

export type UnityPayloadMode = 'compact' | 'full';

export interface UnityResourceProcessingOptions {
  repoPath: string;
  scopedPaths?: string[];
  payloadMode?: UnityPayloadMode;
}

export interface UnityResourceProcessingDeps {
  buildScanContext?: typeof buildUnityScanContext;
  resolveBindings?: typeof resolveUnityBindings;
}

const UNITY_DIAGNOSTIC_SAMPLE_LIMIT = 3;

export async function processUnityResources(
  graph: KnowledgeGraph,
  options: UnityResourceProcessingOptions,
  deps?: UnityResourceProcessingDeps,
): Promise<UnityResourceProcessingResult> {
  const tStart = performance.now();
  const buildScanContextFn = deps?.buildScanContext || buildUnityScanContext;
  const resolveBindingsFn = deps?.resolveBindings || resolveUnityBindings;
  const payloadMode = resolveUnityPayloadMode(options.payloadMode);
  const classNodes = [...graph.iterNodes()].filter(
    (node) => node.label === 'Class' && String(node.properties.filePath || '').endsWith('.cs'),
  );
  const symbolDeclarations: UnitySymbolDeclaration[] = classNodes
    .map((node) => ({
      symbol: String(node.properties.name || '').trim(),
      scriptPath: String(node.properties.filePath || '').trim(),
    }))
    .filter((entry) => entry.symbol.length > 0 && entry.scriptPath.length > 0);
  let processedSymbols = 0;
  let bindingCount = 0;
  let componentCount = 0;
  const diagnostics: string[] = [];
  const issueDiagnostics: string[] = [];
  let scanContext: UnityScanContext | undefined;
  let symbolsWithResourceHits = new Set<string>();
  let skippedNoGuidHit = 0;
  let skippedMissingCanonical = 0;
  let skippedNonCanonical = 0;
  let canonicalSelected = 0;
  let serializedTypeEdgeCount = 0;
  let serializedTypeMissCount = 0;
  const serializedTypeSymbols = new Set<string>();
  const resolvedBySymbol = new Map<string, Awaited<ReturnType<typeof resolveUnityBindings>>>();
  const resolveErrorBySymbol = new Map<string, string>();
  let scanContextMs = 0;
  let resolveMs = 0;
  let graphWriteMs = 0;

  try {
    const tScanContextStart = performance.now();
    scanContext = await buildScanContextFn({
      repoRoot: options.repoPath,
      scopedPaths: options.scopedPaths,
      symbolDeclarations,
    });
    scanContextMs += performance.now() - tScanContextStart;

    const uniqueResourcePaths = new Set<string>();
    for (const hits of scanContext.guidToResourceHits.values()) {
      for (const hit of hits) {
        uniqueResourcePaths.add(hit.resourcePath);
      }
    }

    diagnostics.push(
      `scanContext: scripts=${scanContext.symbolToScriptPath.size}, guids=${scanContext.scriptPathToGuid.size}, resources=${uniqueResourcePaths.size}`,
    );
    symbolsWithResourceHits = collectSymbolsWithResourceHits(scanContext);
  } catch (error) {
    if (scanContextMs === 0) {
      scanContextMs = performance.now() - tStart;
    }
    diagnostics.push(error instanceof Error ? error.message : String(error));
  }

  const canonicalClassNodeBySymbol = buildCanonicalClassNodeIndex(classNodes, scanContext);

  for (const classNode of classNodes) {
    const symbol = String(classNode.properties.name || '').trim();
    if (!symbol) continue;

    if (scanContext) {
      const canonicalScriptPath = getCanonicalScriptPath(scanContext, symbol);
      if (!canonicalScriptPath) {
        skippedMissingCanonical += 1;
        continue;
      }

      const classNodePath = normalizePath(String(classNode.properties.filePath || '').trim());
      if (classNodePath !== canonicalScriptPath) {
        skippedNonCanonical += 1;
        continue;
      }
      canonicalSelected += 1;

      if (!symbolsWithResourceHits.has(symbol)) {
        skippedNoGuidHit += 1;
        continue;
      }
    }

    try {
      const resolveError = resolveErrorBySymbol.get(symbol);
      if (resolveError) {
        issueDiagnostics.push(resolveError);
        continue;
      }

      let resolved = resolvedBySymbol.get(symbol);
      if (!resolved) {
        const tResolveStart = performance.now();
        resolved = await resolveBindingsFn({ repoRoot: options.repoPath, symbol, scanContext });
        resolveMs += performance.now() - tResolveStart;
        resolvedBySymbol.set(symbol, resolved);
      }

      issueDiagnostics.push(...resolved.unityDiagnostics);
      if (resolved.resourceBindings.length === 0) {
        continue;
      }

      processedSymbols += 1;

      for (const summary of collectResourceSummaryRows(resolved.resourceBindings)) {
        const resourceFileId = generateId('File', summary.resourcePath);
        graph.addRelationship({
          id: generateId('UNITY_RESOURCE_SUMMARY', `${classNode.id}->${resourceFileId}`),
          type: 'UNITY_RESOURCE_SUMMARY',
          sourceId: classNode.id,
          targetId: resourceFileId,
          confidence: 1.0,
          reason: JSON.stringify({
            resourceType: summary.resourceType,
            bindingKinds: summary.bindingKinds,
            lightweight: summary.lightweight,
          }),
        });
      }

      for (const binding of resolved.resourceBindings) {
        const tWriteStart = performance.now();
        bindingCount += 1;
        componentCount += 1;

        const componentNode = createComponentNode(symbol, binding, payloadMode);
        graph.addNode(componentNode);

        graph.addRelationship({
          id: generateId('UNITY_COMPONENT_INSTANCE', `${classNode.id}->${componentNode.id}`),
          type: 'UNITY_COMPONENT_INSTANCE',
          sourceId: classNode.id,
          targetId: componentNode.id,
          confidence: 1.0,
          reason: binding.bindingKind,
        });

        const serializableTypeLinking = linkSerializableTypeEdges(
          graph,
          componentNode,
          symbol,
          binding,
          scanContext,
          canonicalClassNodeBySymbol,
        );
        serializedTypeEdgeCount += serializableTypeLinking.edgeCount;
        serializedTypeMissCount += serializableTypeLinking.missCount;
        for (const hitSymbol of serializableTypeLinking.symbols) {
          serializedTypeSymbols.add(hitSymbol);
        }
        graphWriteMs += performance.now() - tWriteStart;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      resolveErrorBySymbol.set(symbol, message);
      issueDiagnostics.push(message);
    }
  }

  if (skippedNoGuidHit > 0) {
    diagnostics.push(`prefilter: skipped ${skippedNoGuidHit} symbol(s) without guid resource hits`);
  }
  diagnostics.push(
    `canonical: selected=${canonicalSelected}, skip-non-canonical=${skippedNonCanonical}, missing-canonical=${skippedMissingCanonical}`,
  );
  diagnostics.push(
    `serialized-type: edges=${serializedTypeEdgeCount}, symbols=${serializedTypeSymbols.size}, misses=${serializedTypeMissCount}`,
  );
  if (skippedMissingCanonical > 0) {
    diagnostics.push(`prefilter: skipped ${skippedMissingCanonical} symbol(s) missing canonical script mapping`);
  }
  diagnostics.push(...aggregateUnityDiagnostics(issueDiagnostics));

  return {
    processedSymbols,
    bindingCount,
    componentCount,
    diagnostics,
    timingsMs: {
      scanContext: roundMs(scanContextMs),
      resolve: roundMs(resolveMs),
      graphWrite: roundMs(graphWriteMs),
      total: roundMs(performance.now() - tStart),
    },
  };
}

function collectSymbolsWithResourceHits(scanContext: UnityScanContext): Set<string> {
  const symbols = new Set<string>();

  const canonicalEntries = scanContext.symbolToCanonicalScriptPath?.entries() || scanContext.symbolToScriptPath.entries();
  for (const [symbol, scriptPath] of canonicalEntries) {
    const guid = scanContext.scriptPathToGuid.get(scriptPath);
    if (!guid) continue;
    if ((scanContext.guidToResourceHits.get(guid) || []).length === 0) continue;
    symbols.add(symbol);
  }

  return symbols;
}

function getCanonicalScriptPath(scanContext: UnityScanContext, symbol: string): string | undefined {
  const canonicalPath = scanContext.symbolToCanonicalScriptPath?.get(symbol);
  if (canonicalPath) {
    return normalizePath(canonicalPath);
  }
  const fallbackPath = scanContext.symbolToScriptPath.get(symbol);
  if (fallbackPath) {
    return normalizePath(fallbackPath);
  }
  return undefined;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function resolveUnityPayloadMode(explicit?: UnityPayloadMode): UnityPayloadMode {
  if (explicit) return explicit;
  const envMode = String(process.env.GITNEXUS_UNITY_PAYLOAD_MODE || '').trim().toLowerCase();
  if (envMode === 'full') return 'full';
  return 'compact';
}

function createComponentNode(
  symbol: string,
  binding: Awaited<ReturnType<typeof resolveUnityBindings>>['resourceBindings'][number],
  payloadMode: UnityPayloadMode,
): GraphNode {
  const payload = buildUnityPayload(binding, payloadMode);
  return {
    id: generateId('CodeElement', `${binding.resourcePath}:${binding.componentObjectId}`),
    label: 'CodeElement',
    properties: {
      name: `${symbol}@${binding.componentObjectId}`,
      filePath: binding.resourcePath,
      startLine: binding.evidence.line,
      endLine: binding.evidence.line,
      description: JSON.stringify(payload),
    },
  };
}

function buildUnityPayload(
  binding: Awaited<ReturnType<typeof resolveUnityBindings>>['resourceBindings'][number],
  mode: UnityPayloadMode,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    bindingKind: binding.bindingKind,
    componentObjectId: binding.componentObjectId,
  };
  if (binding.lightweight) {
    payload.lightweight = true;
  }

  const serializedFields = compactSerializedFieldsForStorage(binding.serializedFields);
  if (serializedFields.scalarFields.length > 0 || serializedFields.referenceFields.length > 0) {
    payload.serializedFields = serializedFields;
  }
  if (binding.resolvedReferences && binding.resolvedReferences.length > 0) {
    payload.resolvedReferences = binding.resolvedReferences;
  }
  if (binding.assetRefPaths && binding.assetRefPaths.length > 0) {
    payload.assetRefPaths = binding.assetRefPaths;
  }

  if (mode === 'full') {
    payload.resourcePath = binding.resourcePath;
    payload.resourceType = binding.resourceType;
    payload.evidence = binding.evidence;
  }

  return payload;
}

function compactSerializedFieldsForStorage(
  input: Awaited<ReturnType<typeof resolveUnityBindings>>['resourceBindings'][number]['serializedFields'],
): Awaited<ReturnType<typeof resolveUnityBindings>>['resourceBindings'][number]['serializedFields'] {
  return {
    scalarFields: input.scalarFields.map((field) => ({
      name: field.name,
      sourceLayer: field.sourceLayer,
      value: field.value,
      valueType: field.valueType,
    })),
    referenceFields: input.referenceFields.map((field) => ({
      name: field.name,
      guid: field.guid,
      fileId: field.fileId,
      sourceLayer: field.sourceLayer,
    })),
  };
}

function buildCanonicalClassNodeIndex(
  classNodes: GraphNode[],
  scanContext?: UnityScanContext,
): Map<string, GraphNode> {
  const index = new Map<string, GraphNode>();
  for (const classNode of classNodes) {
    const symbol = String(classNode.properties.name || '').trim();
    if (!symbol || index.has(symbol)) continue;

    const classPath = normalizePath(String(classNode.properties.filePath || '').trim());
    const canonicalPath = scanContext ? getCanonicalScriptPath(scanContext, symbol) : undefined;
    if (canonicalPath && classPath !== canonicalPath) {
      continue;
    }
    index.set(symbol, classNode);
  }
  return index;
}

interface SerializableTypeLinkingStats {
  edgeCount: number;
  missCount: number;
  symbols: Set<string>;
}

function linkSerializableTypeEdges(
  graph: KnowledgeGraph,
  componentNode: GraphNode,
  hostSymbol: string,
  binding: Awaited<ReturnType<typeof resolveUnityBindings>>['resourceBindings'][number],
  scanContext: UnityScanContext | undefined,
  canonicalClassNodeBySymbol: Map<string, GraphNode>,
): SerializableTypeLinkingStats {
  const stats: SerializableTypeLinkingStats = {
    edgeCount: 0,
    missCount: 0,
    symbols: new Set<string>(),
  };
  if (!scanContext) return stats;

  const serializableSymbols = (scanContext as { serializableSymbols?: Set<string> }).serializableSymbols;
  const hostFieldTypeHints = (scanContext as { hostFieldTypeHints?: Map<string, Map<string, string>> }).hostFieldTypeHints;
  if (!serializableSymbols || !hostFieldTypeHints) return stats;

  const hostHints = hostFieldTypeHints.get(hostSymbol);
  if (!hostHints || hostHints.size === 0) return stats;

  const fieldSourceLayer = collectBindingFieldSources(binding);
  if (fieldSourceLayer.size === 0) return stats;

  for (const [fieldName, declaredType] of hostHints.entries()) {
    if (!serializableSymbols.has(declaredType)) continue;

    const sourceLayer = fieldSourceLayer.get(fieldName);
    if (!sourceLayer) continue;

    const serializableNode = canonicalClassNodeBySymbol.get(declaredType);
    if (!serializableNode) {
      stats.missCount += 1;
      continue;
    }

    graph.addRelationship({
      id: generateId('UNITY_SERIALIZED_TYPE_IN', `${serializableNode.id}->${componentNode.id}:${fieldName}`),
      type: 'UNITY_SERIALIZED_TYPE_IN',
      sourceId: serializableNode.id,
      targetId: componentNode.id,
      confidence: 1.0,
      reason: JSON.stringify({ hostSymbol, fieldName, declaredType, sourceLayer }),
    });
    stats.edgeCount += 1;
    stats.symbols.add(declaredType);
  }

  return stats;
}

function collectBindingFieldSources(
  binding: Awaited<ReturnType<typeof resolveUnityBindings>>['resourceBindings'][number],
): Map<string, string> {
  const fieldSources = new Map<string, string>();
  for (const field of binding.serializedFields.scalarFields) {
    if (!fieldSources.has(field.name)) {
      fieldSources.set(field.name, field.sourceLayer || 'unknown');
    }
  }
  for (const field of binding.serializedFields.referenceFields) {
    if (!fieldSources.has(field.name)) {
      fieldSources.set(field.name, field.sourceLayer || 'unknown');
    }
  }
  return fieldSources;
}

function collectResourceSummaryRows(
  bindings: Awaited<ReturnType<typeof resolveUnityBindings>>['resourceBindings'],
): Array<{ resourcePath: string; resourceType: string; bindingKinds: string[]; lightweight: boolean }> {
  const summaryByPath = new Map<string, { resourceType: string; bindingKinds: Set<string>; lightweight: boolean }>();
  for (const binding of bindings) {
    const resourcePath = normalizePath(binding.resourcePath);
    const row = summaryByPath.get(resourcePath) || {
      resourceType: binding.resourceType,
      bindingKinds: new Set<string>(),
      lightweight: true,
    };
    row.resourceType = binding.resourceType || row.resourceType;
    row.bindingKinds.add(binding.bindingKind);
    row.lightweight = row.lightweight && Boolean(binding.lightweight);
    summaryByPath.set(resourcePath, row);
  }

  return [...summaryByPath.entries()].map(([resourcePath, value]) => ({
    resourcePath,
    resourceType: value.resourceType,
    bindingKinds: [...value.bindingKinds.values()].sort(),
    lightweight: value.lightweight,
  }));
}

function roundMs(value: number): number {
  return Number(value.toFixed(1));
}

type UnityDiagnosticCategory =
  | 'no-monobehaviour-match'
  | 'ambiguous-symbol'
  | 'symbol-not-found'
  | 'missing-meta-guid'
  | 'other';

interface UnityDiagnosticBucket {
  count: number;
  samples: string[];
}

function aggregateUnityDiagnostics(messages: string[]): string[] {
  if (messages.length === 0) {
    return [];
  }

  const buckets = new Map<UnityDiagnosticCategory, UnityDiagnosticBucket>();
  for (const message of messages) {
    const category = classifyUnityDiagnostic(message);
    const bucket = buckets.get(category) || { count: 0, samples: [] };
    bucket.count += 1;
    if (bucket.samples.length < UNITY_DIAGNOSTIC_SAMPLE_LIMIT && !bucket.samples.includes(message)) {
      bucket.samples.push(message);
    }
    buckets.set(category, bucket);
  }

  const ordered = [...buckets.entries()].sort((left, right) => right[1].count - left[1].count);
  const lines: string[] = [
    `diagnostics: aggregated ${messages.length} issue(s) across ${ordered.length} category(ies); sampleLimit=${UNITY_DIAGNOSTIC_SAMPLE_LIMIT}`,
  ];

  for (const [category, bucket] of ordered) {
    lines.push(
      `diagnostics: category=${category} count=${bucket.count} sampleCount=${bucket.samples.length}`,
    );
    for (const sample of bucket.samples) {
      lines.push(`diagnostics: sample[${category}] ${sample}`);
    }
  }

  return lines;
}

function classifyUnityDiagnostic(message: string): UnityDiagnosticCategory {
  if (message.startsWith('No MonoBehaviour block matched script guid ')) {
    return 'no-monobehaviour-match';
  }
  if (message.startsWith('Unity symbol "') && message.endsWith('" is ambiguous.')) {
    return 'ambiguous-symbol';
  }
  if (message.startsWith('Unity symbol "') && message.includes('" was not found under ')) {
    return 'symbol-not-found';
  }
  if (message.startsWith('No .meta guid found for ')) {
    return 'missing-meta-guid';
  }
  return 'other';
}
