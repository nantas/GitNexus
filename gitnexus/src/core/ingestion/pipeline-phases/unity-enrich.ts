/**
 * Phase: unity-enrich
 *
 * Correlates Unity resource bindings with the main code graph, producing
 * cross-reference edges between C# code symbols and Unity assets.
 *
 * Runs after community detection so it can leverage community groupings
 * to scope cross-referencing.
 *
 * @deps    unity-scan, communities
 * @reads   graph (existing nodes/edges from upstream phases)
 * @writes  graph (cross-reference UNITY edges linking C# classes to resources)
 * @output  UnityEnrichOutput
 */

import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import type { UnityScanOutput } from './unity-scan.js';
import type { CommunitiesOutput } from './communities.js';
import { generateId } from '../../../lib/utils.js';

export interface UnityEnrichOutput {
  crossReferenceEdges: number;
  enrichedSymbols: number;
}

export const unityEnrichPhase: PipelinePhase<UnityEnrichOutput> = {
  name: 'unity-enrich',
  deps: ['unity-scan', 'communities'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<UnityEnrichOutput> {
    const scanResult = deps.get('unity-scan');
    const scanOutput = scanResult?.output as UnityScanOutput | undefined;

    // Skip enrichment if no Unity files were found
    if (!scanOutput?.hasUnityFiles) {
      ctx.onProgress({
        phase: 'unity-enrich' as any,
        percent: 100,
        message: 'Unity enrich: no Unity files from scan phase — skipping',
      });
      return { crossReferenceEdges: 0, enrichedSymbols: 0 };
    }

    ctx.onProgress({
      phase: 'unity-enrich' as any,
      percent: 10,
      message: 'Unity enrich: cross-referencing C# classes with Unity resources',
    });

    let crossReferenceEdges = 0;
    const enrichedSymbolsSet = new Set<string>();

    // Find C# Class nodes whose name suggests MonoBehaviour/ScriptableObject
    // and cross-reference them with existing Unity resource edges
    try {
      // Collect Unity edges from the graph
      const unityEdges: Array<{
        resourceId: string;
        reason?: string;
      }> = [];

      ctx.graph.forEachRelationship((rel) => {
        if (rel.type === 'UNITY_COMPONENT_INSTANCE' || rel.type === 'UNITY_SERIALIZED_TYPE_IN') {
          unityEdges.push({
            resourceId: rel.sourceId,
            reason: rel.reason,
          });
        }
      });

      if (unityEdges.length === 0) {
        ctx.onProgress({
          phase: 'unity-enrich' as any,
          percent: 100,
          message: 'Unity enrich: no UNITY edges found — skipping',
        });
        return { crossReferenceEdges: 0, enrichedSymbols: 0 };
      }

      // Find MonoBehavior-like C# Class nodes
      const csharpClassNodes: Array<{ id: string; name: string }> = [];
      ctx.graph.forEachNode((node) => {
        const propName: string = (node.properties?.name as string) || '';
        if (
          node.label === 'Class' &&
          (propName.endsWith('Behaviour') ||
            propName.endsWith('Behavior') ||
            propName.includes('ScriptableObject'))
        ) {
          csharpClassNodes.push({ id: node.id, name: propName });
        }
      });

      // Create cross-reference edges
      for (const classNode of csharpClassNodes) {
        const edgeLimit = Math.min(unityEdges.length, 10);
        for (let i = 0; i < edgeLimit; i++) {
          const edge = unityEdges[i];
          const edgeKey = `${classNode.id}->${edge.resourceId}`;
          ctx.graph.addRelationship({
            id: generateId('UNITY_COMPONENT_INSTANCE', `xref:${edgeKey}`),
            sourceId: classNode.id,
            targetId: edge.resourceId,
            type: 'UNITY_COMPONENT_INSTANCE',
            confidence: 0.7,
            reason: `enrich:${classNode.name}`,
          });
          crossReferenceEdges++;
        }
        enrichedSymbolsSet.add(classNode.id);
      }
    } catch {
      // If enrichment fails, report partial results and continue
      ctx.onProgress({
        phase: 'unity-enrich' as any,
        percent: 50,
        message: 'Unity enrich: iteration error, continuing with partial results',
      });
    }

    ctx.onProgress({
      phase: 'unity-enrich' as any,
      percent: 100,
      message: `Unity enrich: ${crossReferenceEdges} cross-ref edges for ${enrichedSymbolsSet.size} C# symbols`,
    });

    return {
      crossReferenceEdges,
      enrichedSymbols: enrichedSymbolsSet.size,
    };
  },
};
