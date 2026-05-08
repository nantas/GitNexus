import type { KnowledgeGraph } from '../core/graph/types.js';
import { CommunityDetectionResult } from '../core/ingestion/community-processor.js';
import { ProcessDetectionResult } from '../core/ingestion/process-processor.js';
import type { UnityResourceProcessingResult } from '../core/ingestion/unity-resource-processor.js';
import type { UnityRuntimeBindingResult } from '../core/ingestion/unity-runtime-binding-rules.js';
import type { ScopeSelectionDiagnostics } from '../core/ingestion/scope-filter.js';

export type PipelinePhase = 'idle' | 'extracting' | 'structure' | 'parsing' | 'imports' | 'calls' | 'heritage' | 'communities' | 'processes' | 'enriching' | 'complete' | 'error';

export interface PipelineProgress {
  phase: PipelinePhase;
  percent: number;
  message: string;
  detail?: string;
  stats?: {
    filesProcessed: number;
    totalFiles: number;
    nodesCreated: number;
  };
}

export interface PipelineRunOptions {
  includeExtensions?: string[];
  scopeRules?: string[];
  csharpDefineCsproj?: string;
}

export interface CSharpPreprocDiagnostics {
  enabled: boolean;
  sourcePath?: string;
  defineSymbolCount: number;
  normalizedFiles: number;
  fallbackFiles: number;
  skippedFiles: number;
  expressionErrors: number;
  undefinedSymbols: string[];
}

// Original result type (used internally in pipeline)
export interface PipelineResult {
  graph: KnowledgeGraph;
  /** Absolute path to the repo root — used for lazy file reads during LadybugDB loading */
  repoPath: string;
  /** Total files scanned (for stats) */
  totalFileCount: number;
  communityResult?: CommunityDetectionResult;
  processResult?: ProcessDetectionResult;
  unityResult?: UnityResourceProcessingResult;
  unityRuleBindingResult?: UnityRuntimeBindingResult;
  scopeDiagnostics?: ScopeSelectionDiagnostics;
  csharpPreprocDiagnostics?: CSharpPreprocDiagnostics;
}

export interface PipelineRuntimeSummary {
  totalFileCount: number;
  communityResult?: CommunityDetectionResult;
  processResult?: ProcessDetectionResult;
  unityResult?: UnityResourceProcessingResult;
  unityRuleBindingResult?: UnityRuntimeBindingResult;
  scopeDiagnostics?: ScopeSelectionDiagnostics;
  csharpPreprocDiagnostics?: CSharpPreprocDiagnostics;
}

// Serializable version for Web Worker communication
// Maps and functions cannot be transferred via postMessage
export interface SerializablePipelineResult {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  repoPath: string;
  totalFileCount: number;
  unityResult?: UnityResourceProcessingResult;
}

// Helper to convert PipelineResult to serializable format
export const serializePipelineResult = (result: PipelineResult): SerializablePipelineResult => ({
  nodes: [...result.graph.iterNodes()],
  relationships: [...result.graph.iterRelationships()],
  repoPath: result.repoPath,
  totalFileCount: result.totalFileCount,
  unityResult: result.unityResult,
});

// Helper to reconstruct from serializable format (used in main thread)
export const deserializePipelineResult = (
  serialized: SerializablePipelineResult,
  createGraph: () => KnowledgeGraph
): PipelineResult => {
  const graph = createGraph();
  serialized.nodes.forEach(node => graph.addNode(node));
  serialized.relationships.forEach(rel => graph.addRelationship(rel));

  return {
    graph,
    repoPath: serialized.repoPath,
    totalFileCount: serialized.totalFileCount,
    unityResult: serialized.unityResult,
  };
};
