/** Read-only migration planning and no-overwrite creation of repository analyze defaults. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadAnalyzeConfigStrict, parseAnalyzeConfig, GITNEXUS_RC_FILENAME } from './analyze-config.js';
import { getCurrentBranch, getGitRoot } from '../storage/git.js';
import { getStoragePath, isMissingFilesystemError, type RepoMeta } from '../storage/repo-meta.js';
import { INDEX_METADATA_FILE, LEGACY_METADATA_FILE } from '../storage/storage-constants.js';
import { BRANCHES_DIR, branchSlug } from '../storage/branch-index.js';

export type RcMode = 'auto' | 'migrate' | 'create' | 'skip';
export interface RcChoices {
  scope?: string;
  extensions?: string;
  name?: string;
  csharpDefineCsproj?: string;
}
export interface RcPlan {
  repoRoot: string;
  state: 'preserved' | 'pending' | 'skipped';
  proposed: Record<string, unknown>;
  sources: Record<string, string>;
  metadataPath?: string;
  indexedAt?: string;
  conflicts: string[];
  unresolved: string[];
  error?: string;
}

type MetadataRead =
  | { state: 'absent' }
  | { state: 'invalid'; error: string; path: string }
  | { state: 'valid'; meta: RepoMeta; path: string };

async function readOne(dir: string, name: string): Promise<MetadataRead> {
  const file = path.join(dir, name);
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    return isMissingFilesystemError(error)
      ? { state: 'absent' }
      : { state: 'invalid', path: file, error: String(error) };
  }
  try {
    const meta: unknown = JSON.parse(raw);
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
      throw new Error('metadata must be a JSON object');
    }
    return { state: 'valid', meta: meta as RepoMeta, path: file };
  } catch (error) {
    return { state: 'invalid', path: file, error: String(error) };
  }
}

export async function readMigrationMetadata(dir: string): Promise<MetadataRead> {
  const primary = await readOne(dir, INDEX_METADATA_FILE);
  return primary.state === 'absent' ? readOne(dir, LEGACY_METADATA_FILE) : primary;
}

function selection(meta: RepoMeta, key: 'scopeRules' | 'includeExtensions'):
  { value?: string[]; source?: string; conflict?: string } {
  const coverage = meta.indexCoverage?.[key];
  const legacy = meta.analyzeOptions?.[key];
  const conflict = coverage !== undefined && legacy !== undefined &&
    JSON.stringify(coverage) !== JSON.stringify(legacy)
    ? `indexCoverage.${key}=${JSON.stringify(coverage)} conflicts with analyzeOptions.${key}=${JSON.stringify(legacy)}`
    : undefined;
  return coverage !== undefined
    ? { value: coverage, source: `indexCoverage.${key}`, conflict }
    : legacy !== undefined
      ? { value: legacy, source: `analyzeOptions.${key}` }
      : {};
}

export function parseRcSelection(raw: string, flag: string): string[] {
  if (raw === 'all') return [];
  const values = raw.split(',').map((entry) => entry.trim());
  if (values.some((entry) => !entry)) throw new Error(`${flag} requires all or a comma-separated non-empty list.`);
  return values;
}

function validateCsproj(repoRoot: string, value: unknown): string {
  if (typeof value !== 'string') throw new Error('csharpDefineCsproj must be a path.');
  const file = path.resolve(repoRoot, value);
  const relative = path.relative(repoRoot, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`csharpDefineCsproj must stay within ${repoRoot}.`);
  }
  return file;
}

export async function planRepositoryAnalyzeConfig(
  repoRoot: string,
  mode: RcMode,
  choices: RcChoices = {},
): Promise<RcPlan> {
  const plan: RcPlan = {
    repoRoot, state: 'pending', proposed: {}, sources: {}, conflicts: [], unresolved: [],
  };
  if (mode === 'skip') return { ...plan, state: 'skipped' };
  const existing = await loadAnalyzeConfigStrict(repoRoot);
  if (existing !== undefined) {
    if (mode !== 'auto') throw new Error(`${GITNEXUS_RC_FILENAME} already exists; ${mode} will not overwrite it.`);
    return { ...plan, state: 'preserved', proposed: existing as Record<string, unknown> };
  }

  if (mode !== 'create') {
    const canonicalRoot = await fs.realpath(repoRoot);
    const storage = getStoragePath(repoRoot);
    const flat = await readMigrationMetadata(storage);
    const branch = getCurrentBranch(repoRoot);
    const active = branch
      ? await readMigrationMetadata(path.join(storage, BRANCHES_DIR, branchSlug(branch)))
      : { state: 'absent' } as MetadataRead;
    for (const item of [flat, active]) {
      if (item.state === 'invalid') {
        plan.error = `${item.path}: ${item.error}`;
        return plan;
      }
      if (item.state === 'valid') {
        if (typeof item.meta.repoPath !== 'string' ||
          await fs.realpath(item.meta.repoPath).catch(() => null) !== canonicalRoot) {
          plan.error = `${item.path}: repoPath does not identify ${repoRoot}.`;
          return plan;
        }
      }
    }
    const chosen = active.state === 'valid' ? active : flat;
    if (chosen.state === 'valid') {
      plan.metadataPath = chosen.path;
      plan.indexedAt = chosen.meta.indexedAt;
      for (const key of ['scopeRules', 'includeExtensions'] as const) {
        const picked = selection(chosen.meta, key);
        if (picked.value !== undefined) {
          plan.proposed[key] = picked.value;
          plan.sources[key] = `${chosen.path}: ${picked.source}`;
        }
        if (picked.conflict) plan.conflicts.push(`${chosen.path}: ${picked.conflict}`);
        if (flat.state === 'valid' && active.state === 'valid') {
          const other = selection(flat.meta, key);
          if (other.value !== undefined && picked.value !== undefined &&
            JSON.stringify(other.value) !== JSON.stringify(picked.value)) {
            plan.conflicts.push(`${key}: active branch ${JSON.stringify(picked.value)} conflicts with flat slot ${JSON.stringify(other.value)}`);
          }
        }
      }
      const legacy = chosen.meta.analyzeOptions;
      const map: [string, unknown, string][] = [
        ['name', legacy?.repoAlias, 'analyzeOptions.repoAlias'],
        ['csharpDefineCsproj', legacy?.csharpDefineCsproj, 'analyzeOptions.csharpDefineCsproj'],
        ['embeddings', legacy?.embeddings, 'analyzeOptions.embeddings'],
        ['skipAgentsMd', legacy?.aiContext === false ? true : undefined, 'analyzeOptions.aiContext'],
      ];
      for (const [key, value, source] of map) {
        if (value === undefined) continue;
        plan.proposed[key] = value;
        plan.sources[key] = `${chosen.path}: ${source}`;
      }
      const size = chosen.meta.indexCoverage?.maxFileSizeBytes;
      if (typeof size === 'number' && size !== 512 * 1024 && size > 0 && size % 1024 === 0) {
        plan.proposed.maxFileSize = String(size / 1024);
        plan.sources.maxFileSize = `${chosen.path}: indexCoverage.maxFileSizeBytes (KiB)`;
      }
    }
  }

  if (choices.scope !== undefined) {
    plan.proposed.scopeRules = parseRcSelection(choices.scope, '--rc-scope');
    plan.sources.scopeRules = '--rc-scope';
    plan.conflicts = plan.conflicts.filter((item) => !item.includes('scopeRules'));
  }
  if (choices.extensions !== undefined) {
    plan.proposed.includeExtensions = parseRcSelection(choices.extensions, '--rc-extensions');
    plan.sources.includeExtensions = '--rc-extensions';
    plan.conflicts = plan.conflicts.filter((item) => !item.includes('includeExtensions'));
  }
  if (choices.name !== undefined) { plan.proposed.name = choices.name; plan.sources.name = '--rc-name'; }
  if (choices.csharpDefineCsproj !== undefined) {
    plan.proposed.csharpDefineCsproj = choices.csharpDefineCsproj;
    plan.sources.csharpDefineCsproj = '--rc-csharp-define-csproj';
  }
  for (const key of ['scopeRules', 'includeExtensions']) {
    if (!Object.hasOwn(plan.proposed, key)) plan.unresolved.push(key);
  }
  if (plan.proposed.csharpDefineCsproj !== undefined) {
    const csproj = validateCsproj(repoRoot, plan.proposed.csharpDefineCsproj);
    const stat = await fs.stat(csproj).catch(() => null);
    const resolved = await fs.realpath(csproj).catch(() => null);
    const canonicalRoot = await fs.realpath(repoRoot);
    const relative = resolved ? path.relative(canonicalRoot, resolved) : null;
    if (!stat?.isFile() || !resolved || relative?.startsWith('..') || path.isAbsolute(relative ?? '')) {
      plan.unresolved.push('csharpDefineCsproj (missing or outside repository)');
    }
  }
  parseAnalyzeConfig(JSON.stringify(plan.proposed));
  return plan;
}

export async function createRepositoryAnalyzeConfig(plan: RcPlan): Promise<void> {
  if (plan.error || plan.conflicts.length || plan.unresolved.length) {
    throw new Error('Analysis config plan is incomplete.');
  }
  const gitRoot = getGitRoot(plan.repoRoot);
  if (!gitRoot || await fs.realpath(gitRoot) !== await fs.realpath(plan.repoRoot)) {
    throw new Error(`Repository root changed before creating ${GITNEXUS_RC_FILENAME}.`);
  }
  const target = path.join(plan.repoRoot, GITNEXUS_RC_FILENAME);
  const raw = JSON.stringify(plan.proposed, null, 2) + '\n';
  parseAnalyzeConfig(raw);
  const temporary = path.join(plan.repoRoot, `.${GITNEXUS_RC_FILENAME}.${randomUUID()}.tmp`);
  try {
    const handle = await fs.open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(raw, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.link(temporary, target);
  } finally {
    await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
