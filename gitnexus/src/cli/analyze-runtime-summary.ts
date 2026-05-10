import type { PipelineResult, PipelineRuntimeSummary } from '../types/pipeline.js';

export function toPipelineRuntimeSummary(input: PipelineResult): PipelineRuntimeSummary {
  return {
    totalFileCount: input.totalFileCount,
    communityResult: input.communityResult,
    processResult: input.processResult,
    unityResult: input.unityResult,
    scopeDiagnostics: input.scopeDiagnostics,
    csharpPreprocDiagnostics: input.csharpPreprocDiagnostics,
  };
}
