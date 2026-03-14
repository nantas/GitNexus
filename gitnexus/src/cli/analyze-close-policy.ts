/**
 * Kuzu native close may segfault on some macOS environments.
 * We skip explicit close on analyze exit there, unless force-enabled.
 */
export function shouldCloseKuzuOnAnalyzeExit(
  platform: NodeJS.Platform = process.platform,
  forceCloseOnExit: string | undefined = process.env.GITNEXUS_FORCE_KUZU_CLOSE_ON_EXIT,
): boolean {
  if (forceCloseOnExit === '1') return true;
  return platform !== 'darwin';
}
