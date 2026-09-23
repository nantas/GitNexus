import { createHash } from 'node:crypto';
import path from 'node:path';
import { normalizeScopeRules } from './ingestion/scope-filter.js';
import { loadCSharpDefineProfileFromCsproj } from './tree-sitter/csharp-define-profile.js';

/** Semantic inputs not captured by Git HEAD or source-file hashes. */
export async function resolveAnalysisInputs(
  repoPath: string,
  options: { scopeRules?: string[]; includeExtensions?: string[]; csharpDefineCsproj?: string },
): Promise<{ fingerprint: string; csharpDefineSymbols: string[] | undefined }> {
  const csharpDefineSymbols = options.csharpDefineCsproj
    ? [
        ...(
          await loadCSharpDefineProfileFromCsproj(
            path.resolve(repoPath, options.csharpDefineCsproj),
          )
        ).symbols,
      ].sort()
    : undefined;
  const inputs = {
    // Includes the process evidence/Unity incremental contract migration.
    version: 1,
    scopeRules: normalizeScopeRules(options.scopeRules ?? []).sort(),
    includeExtensions: [
      ...new Set(
        (options.includeExtensions ?? []).map((ext) =>
          (ext.startsWith('.') ? ext : `.${ext}`).toLowerCase(),
        ),
      ),
    ].sort(),
    // null disables preprocessing; [] enables it with no defined symbols.
    csharpDefineSymbols: csharpDefineSymbols ?? null,
  };
  return {
    fingerprint: createHash('sha256').update(JSON.stringify(inputs)).digest('hex'),
    csharpDefineSymbols,
  };
}
