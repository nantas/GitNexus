/**
 * Phase: unity-scan
 *
 * Scans Unity-specific files (.prefab, .unity, .asset, .uxml, .uss, .meta)
 * and produces synthetic UNITY_* edges in the knowledge graph.
 *
 * Only activates when the repository contains Unity file extensions.
 *
 * @deps    scan (scanned file list)
 * @reads   repoPath (filesystem — Unity files)
 * @writes  graph (UNITY_COMPONENT_INSTANCE, UNITY_SERIALIZED_TYPE_IN, UNITY_RESOURCE_SUMMARY edges)
 * @output  UnityScanOutput (count of Unity files and edges produced)
 */

import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import type { ParseOutput } from './parse.js';
import { processUnityResources } from '../unity-resource-processor.js';

const UNITY_EXTENSIONS = new Set(['.prefab', '.unity', '.asset', '.uxml', '.uss', '.meta']);

export interface UnityScanOutput {
  unityFileCount: number;
  edgesProduced: number;
  hasUnityFiles: boolean;
}

export const unityScanPhase: PipelinePhase<UnityScanOutput> = {
  name: 'unity-scan',
  deps: ['parse'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<UnityScanOutput> {
    // Access parse output for file list (Class nodes are already in graph after parse)
    const parseResult = deps.get('parse');
    const parseOutput = parseResult?.output as ParseOutput | undefined;
    const allPaths = parseOutput?.allPaths ?? [];

    if (allPaths.length === 0) {
      ctx.onProgress({
        phase: 'unity-scan' as any,
        percent: 0,
        message: 'Unity scan: no file list available',
      });
      return { unityFileCount: 0, edgesProduced: 0, hasUnityFiles: false };
    }

    // Filter for Unity-specific files
    const unityFiles = allPaths.filter((p) => {
      const dotIdx = p.lastIndexOf('.');
      if (dotIdx === -1) return false;
      const ext = p.slice(dotIdx).toLowerCase();
      return UNITY_EXTENSIONS.has(ext);
    });

    if (unityFiles.length === 0) {
      ctx.onProgress({
        phase: 'unity-scan' as any,
        percent: 100,
        message: 'Unity scan: no Unity files detected — skipping',
      });
      return { unityFileCount: 0, edgesProduced: 0, hasUnityFiles: false };
    }

    ctx.onProgress({
      phase: 'unity-scan' as any,
      percent: 10,
      message: `Unity scan: ${unityFiles.length} Unity files detected`,
    });

    // Delegate to the full Unity resource processor instead of creating placeholder self-loop edges.
    // processUnityResources reads Class nodes from the graph (produced by parse), builds a
    // Unity scan context, resolves bindings, and writes UNITY_COMPONENT_INSTANCE,
    // UNITY_SERIALIZED_TYPE_IN, UNITY_ASSET_GUID_REF, and UNITY_RESOURCE_SUMMARY edges.
    let processorResult: Awaited<ReturnType<typeof processUnityResources>> | undefined;
    try {
      ctx.onProgress({
        phase: 'unity-scan' as any,
        percent: 30,
        message: 'Unity scan: running processUnityResources...',
      });
      processorResult = await processUnityResources(ctx.graph, { repoPath: ctx.repoPath });
    } catch (err) {
      ctx.onProgress({
        phase: 'unity-scan' as any,
        percent: 50,
        message: `Unity scan: processor error — ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    const edgesProduced = processorResult?.bindingCount ?? 0;

    ctx.onProgress({
      phase: 'unity-scan' as any,
      percent: 100,
      message: `Unity scan: ${edgesProduced} edges produced from ${unityFiles.length} Unity files`,
    });

    return {
      unityFileCount: unityFiles.length,
      edgesProduced,
      hasUnityFiles: true,
    };
  },
};
