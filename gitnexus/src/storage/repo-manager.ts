/**
 * Repository Manager
 * 
 * Manages GitNexus index storage in .gitnexus/ at repo root.
 * Also maintains a global registry at ~/.gitnexus/registry.json
 * so the MCP server can discover indexed repos from any cwd.
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface RepoMeta {
  repoPath: string;
  repoId?: string;
  lastCommit: string;
  indexedAt: string;
  analyzeOptions?: {
    includeExtensions?: string[];
    scopeRules?: string[];
    repoAlias?: string;
    embeddings?: boolean;
    csharpDefineCsproj?: string;
  };
  stats?: {
    files?: number;
    nodes?: number;
    edges?: number;
    communities?: number;
    processes?: number;
    embeddings?: number;
  };
}

export interface IndexedRepo {
  repoPath: string;
  storagePath: string;
  lbugPath: string;
  metaPath: string;
  meta: RepoMeta;
}

/**
 * Shape of an entry in the global registry (~/.gitnexus/registry.json)
 */
export interface RegistryEntry {
  name: string;
  path: string;
  storagePath: string;
  indexedAt: string;
  lastCommit: string;
  sourceName?: string;
  alias?: string;
  stats?: RepoMeta['stats'];
}

export interface RegisterRepoOptions {
  repoAlias?: string;
}

const REPO_ALIAS_REGEX = /^[a-zA-Z0-9._-]{3,64}$/;

function normalizeRepoAlias(repoAlias?: string): string | undefined {
  if (!repoAlias) return undefined;
  const trimmed = repoAlias.trim();
  if (!trimmed) return undefined;
  if (!REPO_ALIAS_REGEX.test(trimmed)) {
    throw new Error('Invalid repo alias. Use ^[a-zA-Z0-9._-]{3,64}$');
  }
  return trimmed;
}

const GITNEXUS_DIR = '.gitnexus';

// ─── Local Storage Helpers ─────────────────────────────────────────────

/**
 * Get the .gitnexus storage path for a repository
 */
export const getStoragePath = (repoPath: string): string => {
  return path.join(path.resolve(repoPath), GITNEXUS_DIR);
};

/**
 * Get paths to key storage files
 */
export const getStoragePaths = (repoPath: string) => {
  const storagePath = getStoragePath(repoPath);
  return {
    storagePath,
    lbugPath: path.join(storagePath, 'lbug'),
    metaPath: path.join(storagePath, 'meta.json'),
  };
};

/**
 * Check whether a KuzuDB index exists in the given storage path.
 * Non-destructive — safe to call from status commands.
 */
export const hasKuzuIndex = async (storagePath: string): Promise<boolean> => {
  try {
    await fs.stat(path.join(storagePath, 'kuzu'));
    return true;
  } catch {
    return false;
  }
};

/**
 * Check whether a LadybugDB index exists in the given storage path.
 */
export const hasLbugIndex = async (storagePath: string): Promise<boolean> => {
  try {
    await fs.stat(path.join(storagePath, 'lbug'));
    return true;
  } catch {
    return false;
  }
};

/**
 * Clean up stale KuzuDB files after migration to LadybugDB.
 *
 * Returns:
 *   found        — true if .gitnexus/kuzu existed and was deleted
 *   needsReindex — true if kuzu existed but lbug does not (re-analyze required)
 *
 * Callers own the user-facing messaging; this function only deletes files.
 */
export const cleanupOldKuzuFiles = async (
  storagePath: string,
): Promise<{ found: boolean; needsReindex: boolean }> => {
  const oldPath = path.join(storagePath, 'kuzu');
  const newPath = path.join(storagePath, 'lbug');
  try {
    await fs.stat(oldPath);
    // Old kuzu file/dir exists — determine if lbug is already present
    let needsReindex = false;
    try {
      await fs.stat(newPath);
    } catch {
      needsReindex = true;
    }
    // Delete kuzu database file and its sidecars (.wal, .lock)
    for (const suffix of ['', '.wal', '.lock']) {
      try { await fs.unlink(oldPath + suffix); } catch {}
    }
    // Also handle the case where kuzu was stored as a directory
    try { await fs.rm(oldPath, { recursive: true, force: true }); } catch {}
    return { found: true, needsReindex };
  } catch {
    // Old path doesn't exist — nothing to do
    return { found: false, needsReindex: false };
  }
};

/**
 * Load metadata from an indexed repo
 */
export const loadMeta = async (storagePath: string): Promise<RepoMeta | null> => {
  try {
    const metaPath = path.join(storagePath, 'meta.json');
    const raw = await fs.readFile(metaPath, 'utf-8');
    return JSON.parse(raw) as RepoMeta;
  } catch {
    return null;
  }
};

/**
 * Save metadata to storage
 */
export const saveMeta = async (storagePath: string, meta: RepoMeta): Promise<void> => {
  await fs.mkdir(storagePath, { recursive: true });
  const metaPath = path.join(storagePath, 'meta.json');
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
};

/**
 * Check if a path has a GitNexus index
 */
export const hasIndex = async (repoPath: string): Promise<boolean> => {
  const { metaPath } = getStoragePaths(repoPath);
  try {
    await fs.access(metaPath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Load an indexed repo from a path
 */
export const loadRepo = async (repoPath: string): Promise<IndexedRepo | null> => {
  const paths = getStoragePaths(repoPath);
  const meta = await loadMeta(paths.storagePath);
  if (!meta) return null;
  
  return {
    repoPath: path.resolve(repoPath),
    ...paths,
    meta,
  };
};

/**
 * Find .gitnexus by walking up from a starting path
 */
export const findRepo = async (startPath: string): Promise<IndexedRepo | null> => {
  let current = path.resolve(startPath);
  const root = path.parse(current).root;
  
  while (current !== root) {
    const repo = await loadRepo(current);
    if (repo) return repo;
    current = path.dirname(current);
  }
  
  return null;
};

/**
 * Add .gitnexus to .gitignore if not already present
 */
export const addToGitignore = async (repoPath: string): Promise<void> => {
  const gitignorePath = path.join(repoPath, '.gitignore');
  
  try {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    if (content.includes(GITNEXUS_DIR)) return;
    
    const newContent = content.endsWith('\n') 
      ? `${content}${GITNEXUS_DIR}\n`
      : `${content}\n${GITNEXUS_DIR}\n`;
    await fs.writeFile(gitignorePath, newContent, 'utf-8');
  } catch {
    // .gitignore doesn't exist, create it
    await fs.writeFile(gitignorePath, `${GITNEXUS_DIR}\n`, 'utf-8');
  }
};

// ─── Global Registry (~/.gitnexus/registry.json) ───────────────────────

/**
 * Get the path to the global GitNexus directory
 */
export const getGlobalDir = (): string => {
  if (process.env.GITNEXUS_HOME && process.env.GITNEXUS_HOME.trim()) {
    return path.resolve(process.env.GITNEXUS_HOME);
  }
  return path.join(os.homedir(), '.gitnexus');
};

/**
 * Get the path to the global registry file
 */
export const getGlobalRegistryPath = (): string => {
  return path.join(getGlobalDir(), 'registry.json');
};

/**
 * Read the global registry. Returns empty array if not found.
 */
export const readRegistry = async (): Promise<RegistryEntry[]> => {
  try {
    const raw = await fs.readFile(getGlobalRegistryPath(), 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

/**
 * Write the global registry to disk
 */
const writeRegistry = async (entries: RegistryEntry[]): Promise<void> => {
  const dir = getGlobalDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(getGlobalRegistryPath(), JSON.stringify(entries, null, 2), 'utf-8');
};

/**
 * Register (add or update) a repo in the global registry.
 * Called after `gitnexus analyze` completes.
 */
export const registerRepo = async (
  repoPath: string,
  meta: RepoMeta,
  options?: RegisterRepoOptions,
): Promise<RegistryEntry> => {
  const resolved = path.resolve(repoPath);
  const sourceName = path.basename(resolved);
  const alias = normalizeRepoAlias(options?.repoAlias);
  const name = alias || sourceName;
  const { storagePath } = getStoragePaths(resolved);

  const entries = await readRegistry();
  if (alias) {
    const aliasConflict = entries.find(
      (e) => e.name === alias && (
        process.platform === 'win32'
          ? path.resolve(e.path).toLowerCase() !== resolved.toLowerCase()
          : path.resolve(e.path) !== resolved
      ),
    );
    if (aliasConflict) {
      throw new Error(`Repo alias "${alias}" is already registered for ${aliasConflict.path}`);
    }
  }
  const existing = entries.findIndex((e) => {
    const a = path.resolve(e.path);
    const b = resolved;
    return process.platform === 'win32'
      ? a.toLowerCase() === b.toLowerCase()
      : a === b;
  });

  const entry: RegistryEntry = {
    name,
    path: resolved,
    storagePath,
    indexedAt: meta.indexedAt,
    lastCommit: meta.lastCommit,
    sourceName,
    alias,
    stats: meta.stats,
  };

  if (existing >= 0) {
    entries[existing] = entry;
  } else {
    entries.push(entry);
  }

  await writeRegistry(entries);
  return entry;
};

/**
 * Remove a repo from the global registry.
 * Called after `gitnexus clean`.
 */
export const unregisterRepo = async (repoPath: string): Promise<void> => {
  const resolved = path.resolve(repoPath);
  const entries = await readRegistry();
  const filtered = entries.filter(
    (e) => path.resolve(e.path) !== resolved
  );
  await writeRegistry(filtered);
};

/**
 * List all registered repos from the global registry.
 * Optionally validates that each entry's .gitnexus/ still exists.
 */
export const listRegisteredRepos = async (opts?: { validate?: boolean }): Promise<RegistryEntry[]> => {
  const entries = await readRegistry();
  if (!opts?.validate) return entries;

  // Validate each entry still has a .gitnexus/ directory
  const valid: RegistryEntry[] = [];
  for (const entry of entries) {
    try {
      await fs.access(path.join(entry.storagePath, 'meta.json'));
      await fs.access(path.join(entry.storagePath, 'lbug'));
      valid.push(entry);
    } catch {
      // Index no longer exists — skip
    }
  }

  // If we pruned any entries, save the cleaned registry
  if (valid.length !== entries.length) {
    await writeRegistry(valid);
  }

  return valid;
};

// ─── Global CLI Config (~/.gitnexus/config.json) ─────────────────────────

export interface CLIConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  setupScope?: 'global' | 'project';
  cliPackageSpec?: string;
  cliVersion?: string;
}

/**
 * Get the path to the global CLI config file
 */
export const getGlobalConfigPath = (): string => {
  return path.join(getGlobalDir(), 'config.json');
};

/**
 * Load CLI config from ~/.gitnexus/config.json
 */
export const loadCLIConfig = async (): Promise<CLIConfig> => {
  try {
    const raw = await fs.readFile(getGlobalConfigPath(), 'utf-8');
    return JSON.parse(raw) as CLIConfig;
  } catch {
    return {};
  }
};

/**
 * Save CLI config to ~/.gitnexus/config.json
 */
export const saveCLIConfig = async (config: CLIConfig): Promise<void> => {
  const dir = getGlobalDir();
  await fs.mkdir(dir, { recursive: true });
  const configPath = getGlobalConfigPath();
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  // Restrict file permissions on Unix (config may contain API keys)
  if (process.platform !== 'win32') {
    try { await fs.chmod(configPath, 0o600); } catch { /* best-effort */ }
  }
};
