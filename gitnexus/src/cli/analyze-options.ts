import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeScopeRules } from '../core/ingestion/scope-filter.js';

const REPO_ALIAS_REGEX = /^[a-zA-Z0-9._-]{3,64}$/;

export interface StoredAnalyzeOptions {
  includeExtensions?: string[];
  scopeRules?: string[];
  repoAlias?: string;
  embeddings?: boolean;
  csharpDefineCsproj?: string;
}

export interface ResolveAnalyzeOptionsInput {
  extensions?: string;
  scopeRules?: string[];
  repoAlias?: string;
  embeddings?: boolean;
  reuseOptions?: boolean;
  csharpDefineCsproj?: string;
}

export interface EffectiveAnalyzeOptions {
  includeExtensions: string[];
  scopeRules: string[];
  repoAlias?: string;
  embeddings: boolean;
  csharpDefineCsproj?: string;
}

export interface ValidatedStoredOptions {
  includeExtensions: string[];
  scopeRules: string[];
  repoAlias?: string;
  embeddings: boolean;
  csharpDefineCsproj?: string;
}

export function parseExtensionList(rawExtensions?: string): string[] {
  return (rawExtensions || '')
    .split(',')
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean)
    .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`));
}

export function normalizeRepoAlias(repoAlias?: string): string | undefined {
  if (!repoAlias) return undefined;
  const normalized = repoAlias.trim();
  if (!normalized) return undefined;

  if (!REPO_ALIAS_REGEX.test(normalized)) {
    throw new Error('Invalid repo alias. Use ^[a-zA-Z0-9._-]{3,64}$');
  }
  return normalized;
}

export async function validateStoredOptions(
  stored: StoredAnalyzeOptions | undefined,
  repoPath: string,
): Promise<ValidatedStoredOptions> {
  const result: ValidatedStoredOptions = {
    includeExtensions: [],
    scopeRules: [],
    embeddings: false,
  };

  if (!stored) {
    return result;
  }

  // includeExtensions: each must start with '.'
  if (stored.includeExtensions !== undefined) {
    const valid: string[] = [];
    for (const ext of stored.includeExtensions) {
      if (ext.startsWith('.')) {
        valid.push(ext);
      } else {
        console.warn(`Invalid extension format "${ext}" — must start with '.'. Ignoring.`);
      }
    }
    result.includeExtensions = valid;
  }

  // scopeRules: filter empty/whitespace-only entries
  if (stored.scopeRules !== undefined) {
    result.scopeRules = normalizeScopeRules(
      stored.scopeRules.filter((r) => r.trim().length > 0),
    );
  }

  // repoAlias: validate regex
  if (stored.repoAlias !== undefined) {
    if (REPO_ALIAS_REGEX.test(stored.repoAlias)) {
      result.repoAlias = stored.repoAlias;
    } else {
      console.warn(`Invalid repo alias "${stored.repoAlias}" — must match ^[a-zA-Z0-9._-]{3,64}$. Ignoring.`);
    }
  }

  // embeddings: boolean fallback
  if (stored.embeddings !== undefined) {
    result.embeddings = Boolean(stored.embeddings);
  }

  // csharpDefineCsproj: check file exists
  if (stored.csharpDefineCsproj !== undefined) {
    const csprojPath = path.isAbsolute(stored.csharpDefineCsproj)
      ? stored.csharpDefineCsproj
      : path.resolve(repoPath, stored.csharpDefineCsproj);
    try {
      await fs.stat(csprojPath);
      result.csharpDefineCsproj = stored.csharpDefineCsproj;
    } catch {
      console.warn(`C# project file not found: ${csprojPath}. Ignoring stored --csharp-define-csproj.`);
    }
  }

  return result;
}

export async function resolveEffectiveAnalyzeOptions(
  options?: ResolveAnalyzeOptionsInput,
  stored?: ValidatedStoredOptions,
): Promise<EffectiveAnalyzeOptions> {
  const canReuse = options?.reuseOptions !== false;

  const includeExtensions = options?.extensions !== undefined
    ? parseExtensionList(options.extensions)
    : (canReuse ? (stored?.includeExtensions || []) : []);

  const scopeRules = options?.scopeRules !== undefined
    ? [...options.scopeRules]
    : (canReuse ? (stored?.scopeRules || []) : []);

  const repoAlias = options?.repoAlias !== undefined
    ? normalizeRepoAlias(options.repoAlias)
    : (canReuse ? stored?.repoAlias : undefined);

  const embeddings = options?.embeddings
    ?? (canReuse ? Boolean(stored?.embeddings) : false);

  const csharpDefineCsproj = options?.csharpDefineCsproj !== undefined
    ? options.csharpDefineCsproj
    : (canReuse ? stored?.csharpDefineCsproj : undefined);

  return {
    includeExtensions: [...includeExtensions],
    scopeRules: [...scopeRules],
    repoAlias,
    embeddings,
    csharpDefineCsproj,
  };
}
