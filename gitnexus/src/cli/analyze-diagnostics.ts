import type { CSharpPreprocDiagnostics } from '../types/pipeline.js';
import type { UnityRuntimeBindingResult } from '../core/ingestion/unity-runtime-binding-rules.js';
import {
  formatCSharpPreprocDiagnosticsSummary,
  formatUnityRuleBindingSummary,
  formatFallbackSummary,
  type FallbackInsertStats,
} from './analyze-summary.js';

export interface DiagnosticsContext {
  csharpPreproc?: CSharpPreprocDiagnostics;
  unityBinding?: UnityRuntimeBindingResult;
  fallbackWarnings?: string[];
  fallbackStats?: FallbackInsertStats;
}

/**
 * Consolidate all fork-specific diagnostic output into a structured summary.
 *
 * @param ctx - Pipeline runtime diagnostics context
 * @returns Array of formatted strings ready for console output
 */
export function formatDiagnosticsSummary(ctx: DiagnosticsContext | undefined): string[] {
  if (!ctx) {
    return [];
  }

  const lines: string[] = [];

  const csharpLines = formatCSharpPreprocDiagnosticsSummary(ctx.csharpPreproc);
  if (csharpLines.length > 0) {
    lines.push(...csharpLines);
  }

  const unityLines = formatUnityRuleBindingSummary(ctx.unityBinding);
  if (unityLines.length > 0) {
    lines.push(...unityLines);
  }

  const fallbackLines = formatFallbackSummary(ctx.fallbackWarnings, ctx.fallbackStats);
  if (fallbackLines.length > 0) {
    lines.push(...fallbackLines);
  }

  return lines;
}
