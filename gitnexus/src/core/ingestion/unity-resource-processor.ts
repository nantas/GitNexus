import path from 'node:path';
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
  let skippedMissingScanContextMapping = 0;
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

  for (const classNode of classNodes) {
    const symbol = String(classNode.properties.name || '').trim();
    if (!symbol) continue;

    if (scanContext) {
      if (!scanContext.symbolToScriptPath.has(symbol)) {
        skippedMissingScanContextMapping += 1;
        continue;
      }

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

      for (const binding of resolved.resourceBindings) {
        const tWriteStart = performance.now();
        bindingCount += 1;
        componentCount += 1;

        const resourceFileNode = ensureResourceFileNode(graph, binding.resourcePath);
        const componentNode = createComponentNode(symbol, binding, payloadMode);
        graph.addNode(componentNode);

        graph.addRelationship({
          id: generateId('UNITY_COMPONENT_IN', `${classNode.id}:${binding.componentObjectId}->${resourceFileNode.id}`),
          type: 'UNITY_COMPONENT_IN',
          sourceId: classNode.id,
          targetId: resourceFileNode.id,
          confidence: 1.0,
          reason: binding.bindingKind,
        });

        graph.addRelationship({
          id: generateId('UNITY_COMPONENT_INSTANCE', `${classNode.id}->${componentNode.id}`),
          type: 'UNITY_COMPONENT_INSTANCE',
          sourceId: classNode.id,
          targetId: componentNode.id,
          confidence: 1.0,
          reason: binding.bindingKind,
        });
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
  if (skippedMissingScanContextMapping > 0) {
    diagnostics.push(`prefilter: skipped ${skippedMissingScanContextMapping} symbol(s) missing scanContext script mapping`);
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

  for (const [symbol, scriptPath] of scanContext.symbolToScriptPath.entries()) {
    const guid = scanContext.scriptPathToGuid.get(scriptPath);
    if (!guid) continue;
    if ((scanContext.guidToResourceHits.get(guid) || []).length === 0) continue;
    symbols.add(symbol);
  }

  return symbols;
}

function resolveUnityPayloadMode(explicit?: UnityPayloadMode): UnityPayloadMode {
  if (explicit) return explicit;
  const envMode = String(process.env.GITNEXUS_UNITY_PAYLOAD_MODE || '').trim().toLowerCase();
  if (envMode === 'full') return 'full';
  return 'compact';
}

function ensureResourceFileNode(graph: KnowledgeGraph, resourcePath: string): GraphNode {
  const normalizedResourcePath = resourcePath.replace(/\\/g, '/');
  const fileId = generateId('File', normalizedResourcePath);
  const existing = graph.getNode(fileId);
  if (existing) {
    return existing;
  }

  const node: GraphNode = {
    id: fileId,
    label: 'File',
    properties: {
      name: path.basename(normalizedResourcePath),
      filePath: normalizedResourcePath,
    },
  };
  graph.addNode(node);
  return node;
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

  if (binding.serializedFields.scalarFields.length > 0 || binding.serializedFields.referenceFields.length > 0) {
    payload.serializedFields = binding.serializedFields;
  }
  if (binding.resolvedReferences && binding.resolvedReferences.length > 0) {
    payload.resolvedReferences = binding.resolvedReferences;
  }

  if (mode === 'full') {
    payload.resourcePath = binding.resourcePath;
    payload.resourceType = binding.resourceType;
    payload.evidence = binding.evidence;
  }

  return payload;
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
