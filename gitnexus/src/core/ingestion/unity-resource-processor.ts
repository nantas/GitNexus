import path from 'node:path';
import { generateId } from '../../lib/utils.js';
import type { KnowledgeGraph, GraphNode, GraphRelationship } from '../graph/types.js';
import type { UnityScanContext } from '../unity/scan-context.js';
import { buildUnityScanContext } from '../unity/scan-context.js';
import { resolveUnityBindings } from '../unity/resolver.js';

export interface UnityResourceProcessingResult {
  processedSymbols: number;
  bindingCount: number;
  componentCount: number;
  diagnostics: string[];
}

export async function processUnityResources(
  graph: KnowledgeGraph,
  options: { repoPath: string; scopedPaths?: string[] },
): Promise<UnityResourceProcessingResult> {
  const classNodes = [...graph.iterNodes()].filter(
    (node) => node.label === 'Class' && String(node.properties.filePath || '').endsWith('.cs'),
  );
  let processedSymbols = 0;
  let bindingCount = 0;
  let componentCount = 0;
  const diagnostics: string[] = [];
  let scanContext: UnityScanContext | undefined;

  try {
    scanContext = await buildUnityScanContext({
      repoRoot: options.repoPath,
      scopedPaths: options.scopedPaths,
    });

    const uniqueResourcePaths = new Set<string>();
    for (const hits of scanContext.guidToResourceHits.values()) {
      for (const hit of hits) {
        uniqueResourcePaths.add(hit.resourcePath);
      }
    }

    diagnostics.push(
      `scanContext: scripts=${scanContext.symbolToScriptPath.size}, guids=${scanContext.scriptPathToGuid.size}, resources=${uniqueResourcePaths.size}`,
    );
  } catch (error) {
    diagnostics.push(error instanceof Error ? error.message : String(error));
  }

  for (const classNode of classNodes) {
    const symbol = classNode.properties.name;
    if (!symbol) continue;

    try {
      const resolved = await resolveUnityBindings({ repoRoot: options.repoPath, symbol, scanContext });
      diagnostics.push(...resolved.unityDiagnostics);
      if (resolved.resourceBindings.length === 0) {
        continue;
      }

      processedSymbols += 1;

      for (const binding of resolved.resourceBindings) {
        bindingCount += 1;
        componentCount += 1;

        const resourceFileNode = ensureResourceFileNode(graph, binding.resourcePath);
        const componentNode = createComponentNode(symbol, binding);
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
      }
    } catch (error) {
      diagnostics.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    processedSymbols,
    bindingCount,
    componentCount,
    diagnostics,
  };
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
): GraphNode {
  return {
    id: generateId('CodeElement', `${binding.resourcePath}:${binding.componentObjectId}`),
    label: 'CodeElement',
    properties: {
      name: `${symbol}@${binding.componentObjectId}`,
      filePath: binding.resourcePath,
      startLine: binding.evidence.line,
      endLine: binding.evidence.line,
      description: JSON.stringify({
        resourcePath: binding.resourcePath,
        resourceType: binding.resourceType,
        bindingKind: binding.bindingKind,
        componentObjectId: binding.componentObjectId,
        evidence: binding.evidence,
        serializedFields: binding.serializedFields,
      }),
    },
  };
}
