export interface FallbackInsertStats {
  attempted: number;
  succeeded: number;
  failed: number;
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
