import type { KnowledgeGraph } from '../core/graph/types.js';
import { CommunityDetectionResult } from '../core/ingestion/community-processor.js';
import { ProcessDetectionResult } from '../core/ingestion/process-processor.js';

// ── Fork pipeline options ───────────────────────────────────────────────

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

export interface UnityRuntimeProcessResult {
  hostCount: number;
  syntheticEdgeCount: number;
  rejectedHostCount: number;
  processedSymbols?: number;
  bindingCount?: number;
  diagnostics?: { errors: number; warnings: number; length?: number; some?: (fn: (d: unknown) => boolean) => boolean };
  timingsMs?: { scan: number; bind: number; enrich: number; scanContext?: number; resolve?: number; graphWrite?: number; total?: number };
}

// ── Pipeline result ─────────────────────────────────────────────────────

// CLI-specific: in-memory result with graph + detection results
export interface PipelineResult {
  graph: KnowledgeGraph;
  /** Absolute path to the repo root — used for lazy file reads during LadybugDB loading */
  repoPath: string;
  /** Total files scanned (for stats) */
  totalFileCount: number;
  communityResult?: CommunityDetectionResult;
  processResult?: ProcessDetectionResult;
  /**
   * True if the parse phase spawned a worker pool for this run. False means
   * the sequential fallback handled every chunk. Primarily a test affordance
   * so regression suites can prove which path executed.
   */
  usedWorkerPool: boolean;
  // Fork additions
  unityResult?: UnityRuntimeProcessResult;
  unityRuleBindingResult?: { ruleCount: number; bindingCount: number; edgesInjected?: number };
  csharpPreprocDiagnostics?: CSharpPreprocDiagnostics;
  scopeDiagnostics?: {
    scopeRuleCount: number;
    filteredFiles: number;
    includedFiles: number;
    appliedRuleCount?: number;
    matchedFiles?: number;
    overlapFiles?: number;
    dedupedMatchCount?: number;
    normalizedCollisions?: number;
  };
}

/** Fork: lightweight summary of PipelineResult for CLI output */
export type PipelineRuntimeSummary = Pick<
  PipelineResult,
  'totalFileCount' | 'communityResult' | 'processResult' | 'unityResult' | 'unityRuleBindingResult' | 'scopeDiagnostics' | 'csharpPreprocDiagnostics'
>;
