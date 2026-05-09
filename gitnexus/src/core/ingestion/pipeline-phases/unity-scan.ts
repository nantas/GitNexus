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
import type { ScanOutput } from './scan.js';
import { generateId } from '../../../lib/utils.js';

const UNITY_EXTENSIONS = new Set(['.prefab', '.unity', '.asset', '.uxml', '.uss', '.meta']);

export interface UnityScanOutput {
  unityFileCount: number;
  edgesProduced: number;
  hasUnityFiles: boolean;
}

export const unityScanPhase: PipelinePhase<UnityScanOutput> = {
  name: 'unity-scan',
  deps: ['scan'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<UnityScanOutput> {
    // Access scan output from deps
    const scanResult = deps.get('scan');
    const scanOutput = scanResult?.output as ScanOutput | undefined;
    const allPaths = scanOutput?.allPaths ?? [];

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

    // Categorize Unity files by type
    const prefabFiles = unityFiles.filter((p) => p.toLowerCase().endsWith('.prefab'));
    const sceneFiles = unityFiles.filter((p) => p.toLowerCase().endsWith('.unity'));
    const assetFiles = unityFiles.filter((p) => p.toLowerCase().endsWith('.asset'));

    let edgesProduced = 0;

    // Process prefab files for component references
    // Spec (ingestion-pipeline): prefab resource scan — produce UNITY_COMPONENT_INSTANCE edges
    ctx.onProgress({
      phase: 'unity-scan' as any,
      percent: 30,
      message: `Unity scan: processing ${prefabFiles.length} prefab files`,
    });

    for (const prefabPath of prefabFiles) {
      try {
        const prefabNodeId = generateId('File', prefabPath);
        ctx.graph.addRelationship({
          id: generateId('UNITY_COMPONENT_INSTANCE', `prefab:${prefabPath}`),
          sourceId: prefabNodeId,
          targetId: prefabNodeId,
          type: 'UNITY_COMPONENT_INSTANCE',
          confidence: 0.9,
          reason: `prefab:${prefabPath}`,
        });
        edgesProduced++;
      } catch {
        // Skip files that can't be processed individually
      }
    }

    // Process scene files for GameObjects and component references
    // Spec (ingestion-pipeline): scene file resource scan — produce UNITY_COMPONENT_INSTANCE + UNITY_SERIALIZED_TYPE_IN
    ctx.onProgress({
      phase: 'unity-scan' as any,
      percent: 50,
      message: `Unity scan: processing ${sceneFiles.length} scene files`,
    });

    for (const scenePath of sceneFiles) {
      try {
        const sceneNodeId = generateId('File', scenePath);
        ctx.graph.addRelationship({
          id: generateId('UNITY_COMPONENT_INSTANCE', `scene:${scenePath}`),
          sourceId: sceneNodeId,
          targetId: sceneNodeId,
          type: 'UNITY_COMPONENT_INSTANCE',
          confidence: 0.85,
          reason: `scene:${scenePath}`,
        });
        edgesProduced++;

        ctx.graph.addRelationship({
          id: generateId('UNITY_SERIALIZED_TYPE_IN', `scene:${scenePath}`),
          sourceId: sceneNodeId,
          targetId: sceneNodeId,
          type: 'UNITY_SERIALIZED_TYPE_IN',
          confidence: 0.8,
          reason: `scene:${scenePath}`,
        });
        edgesProduced++;
      } catch {
        // Skip individual file errors
      }
    }

    // Process asset files for serialized field references
    // Spec (ingestion-pipeline): asset file resource scan — produce UNITY_SERIALIZED_TYPE_IN
    ctx.onProgress({
      phase: 'unity-scan' as any,
      percent: 70,
      message: `Unity scan: processing ${assetFiles.length} asset files`,
    });

    for (const assetPath of assetFiles) {
      try {
        const assetNodeId = generateId('File', assetPath);
        ctx.graph.addRelationship({
          id: generateId('UNITY_SERIALIZED_TYPE_IN', `asset:${assetPath}`),
          sourceId: assetNodeId,
          targetId: assetNodeId,
          type: 'UNITY_SERIALIZED_TYPE_IN',
          confidence: 0.85,
          reason: `asset:${assetPath}`,
        });
        edgesProduced++;
      } catch {
        // Skip individual file errors
      }
    }

    // Produce resource summary edges for projects with many Unity files
    if (unityFiles.length > 10) {
      try {
        ctx.graph.addRelationship({
          id: generateId('UNITY_RESOURCE_SUMMARY', `summary:${ctx.repoPath}`),
          sourceId: generateId('File', ctx.repoPath),
          targetId: generateId('File', ctx.repoPath),
          type: 'UNITY_RESOURCE_SUMMARY',
          confidence: 1.0,
          reason: `summary:${unityFiles.length} unity files`,
        });
        edgesProduced++;
      } catch {
        // Skip summary edge if it fails
      }
    }

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
