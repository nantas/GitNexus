import type { CSharpPreprocDiagnostics } from '../types/pipeline.js';

export interface FallbackInsertStats {
  attempted: number;
  succeeded: number;
  failed: number;
}

export function formatCSharpPreprocDiagnosticsSummary(
  diagnostics: CSharpPreprocDiagnostics | undefined,
  previewLimit: number = 5,
): string[] {
  if (!diagnostics?.enabled) return [];

  const lines = [
    `CSharp Preproc: defines=${diagnostics.defineSymbolCount}, normalized=${diagnostics.normalizedFiles}, fallback=${diagnostics.fallbackFiles}, skipped=${diagnostics.skippedFiles}, exprErrors=${diagnostics.expressionErrors}`,
  ];

  if (diagnostics.sourcePath) {
    lines.push(`- source: ${diagnostics.sourcePath}`);
  }

  if (diagnostics.undefinedSymbols.length > 0) {
    const limit = previewLimit > 0 ? previewLimit : diagnostics.undefinedSymbols.length;
    const preview = diagnostics.undefinedSymbols.slice(0, limit);
    lines.push(`- undefined symbols: ${preview.join(', ')}`);
    if (diagnostics.undefinedSymbols.length > preview.length) {
      lines.push(`... ${diagnostics.undefinedSymbols.length - preview.length} more`);
    }
  }

  return lines;
}

export function formatUnityDiagnosticsSummary(
  diagnostics: string[] | undefined,
  previewLimit: number = 3,
): string[] {
  if (!diagnostics || diagnostics.length === 0) {
    return [];
  }

  const limit = previewLimit > 0 ? previewLimit : diagnostics.length;
  const preview = diagnostics.slice(0, limit);
  const lines = [`Unity Diagnostics: ${diagnostics.length} message(s)`];

  for (const message of preview) {
    lines.push(`- ${message}`);
  }

  if (diagnostics.length > preview.length) {
    lines.push(`... ${diagnostics.length - preview.length} more`);
  }

  return lines;
}

export function formatUnityRuleBindingSummary(
  _result: undefined,
  _previewLimit: number = 3,
): string[] {
  return [];
}

export function formatFallbackSummary(
  warnings: string[] | undefined,
  stats: FallbackInsertStats | undefined,
  previewLimit: number = 5,
): string[] {
  if (!warnings || warnings.length === 0) {
    return [];
  }

  const safeStats = stats ?? {
    attempted: 0,
    succeeded: 0,
    failed: 0,
  };

  const limit = previewLimit > 0 ? previewLimit : warnings.length;
  const preview = warnings.slice(0, limit);
  const lines = [
    `Fallback edges: attempted=${safeStats.attempted}, succeeded=${safeStats.succeeded}, failed=${safeStats.failed}, pairTypes=${warnings.length}`,
  ];

  for (const warning of preview) {
    lines.push(`- ${warning}`);
  }

  if (warnings.length > preview.length) {
    lines.push(`... ${warnings.length - preview.length} more`);
  }

  return lines;
}

export function resolveFallbackStats(
  warnings: string[] | undefined,
  stats: FallbackInsertStats | undefined,
): FallbackInsertStats {
  if (stats) {
    return stats;
  }

  if (!warnings || warnings.length === 0) {
    return {
      attempted: 0,
      succeeded: 0,
      failed: 0,
    };
  }

  const attempted = warnings.reduce((sum, warning) => {
    const match = warning.match(/\((\d+)\s+edges\)/);
    return sum + (match ? Number.parseInt(match[1] || '0', 10) : 0);
  }, 0);

  return {
    attempted,
    succeeded: 0,
    failed: attempted,
  };
}
