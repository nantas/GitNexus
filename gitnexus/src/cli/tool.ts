/**
 * Direct CLI Tool Commands
 *
 * Exposes GitNexus tools (query, context, impact, cypher) as direct CLI commands.
 * Bypasses MCP entirely — invokes LocalBackend directly for minimal overhead.
 *
 * Usage:
 *   gitnexus query "authentication flow"
 *   gitnexus context --name "validateUser"
 *   gitnexus impact --target "AuthService" --direction upstream
 *   gitnexus cypher "MATCH (n:Function) RETURN n.name LIMIT 10"
 *
 * Note: Output goes to stdout via fs.writeSync(fd 1), bypassing LadybugDB's
 * native module which captures the Node.js process.stdout stream during init.
 * See the output() function for details (#324).
 */

import { writeSync } from 'node:fs';
import path from 'node:path';
import { LocalBackend } from '../mcp/local/local-backend.js';
import type { UnityEvidenceMode, UnityHydrationMode, UnityResourcesMode } from '../core/unity/options.js';
import type { UnityUiTraceGoal, UnityUiSelectorMode } from '../core/unity/ui-trace.js';
import { getGitRoot } from '../storage/git.js';
import { getStoragePaths, listRegisteredRepos, loadMeta } from '../storage/repo-manager.js';

let _backend: LocalBackend | null = null;

async function getBackend(): Promise<LocalBackend> {
  if (_backend) return _backend;
  _backend = new LocalBackend();
  const ok = await _backend.init();
  if (!ok) {
    cliError('GitNexus: No indexed repositories found. Run: gitnexus analyze');
    process.exit(1);
  }
  return _backend;
}

/**
 * Write tool output to stdout using low-level fd write.
 *
 * LadybugDB's native module captures Node.js process.stdout during init,
 * but the underlying OS file descriptor 1 (stdout) remains intact.
 * By using fs.writeSync(1, ...) we bypass the Node.js stream layer
 * and write directly to the real stdout fd (#324).
 *
 * Falls back to stderr if the fd write fails (e.g., broken pipe).
 */
function output(data: any): void {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  try {
    writeSync(1, text + '\n');
  } catch (err: any) {
    if (err?.code === 'EPIPE') {
      // Consumer closed the pipe (e.g., `gitnexus cypher ... | head -1`)
      // Exit cleanly per Unix convention
      process.exit(0);
    }
    // Fallback: stderr (previous behavior, works on all platforms)
    process.stderr.write(text + '\n');
  }
}

function isUnityUiTraceGoal(value: string): value is UnityUiTraceGoal {
  return value === 'asset_refs' || value === 'template_refs' || value === 'selector_bindings';
}

function isUnityUiSelectorMode(value: string): value is UnityUiSelectorMode {
  return value === 'strict' || value === 'balanced';
}

async function resolveRepoOption(explicitRepo?: string): Promise<string | undefined> {
  if (explicitRepo?.trim()) return explicitRepo.trim();

  const gitRoot = getGitRoot(process.cwd());
  if (!gitRoot) return undefined;

  const { storagePath } = getStoragePaths(gitRoot);
  const meta = await loadMeta(storagePath);
  const repoId = typeof meta?.repoId === 'string' ? meta.repoId.trim() : '';
  if (repoId) return repoId;

  // Backward compatibility for indexes created before repoId persisted in meta.json.
  const entries = await listRegisteredRepos({ validate: false });
  const matched = entries.find((entry) => path.resolve(entry.path) === gitRoot);
  return matched?.name || undefined;
}

export async function queryCommand(queryText: string, options?: {
  repo?: string;
  context?: string;
  goal?: string;
  limit?: string;
  content?: boolean;
  responseProfile?: 'slim' | 'full';
  scopePreset?: 'unity-gameplay' | 'unity-all';
  unityResources?: UnityResourcesMode;
  unityHydration?: UnityHydrationMode;
  unityEvidence?: UnityEvidenceMode;
  resourcePathPrefix?: string;
  resourceSeedMode?: 'strict' | 'balanced';
  runtimeChainVerify?: 'off' | 'on-demand';
}): Promise<void> {
  if (!queryText?.trim()) {
    cliError('Usage: gitnexus query <search_query>');
    process.exit(1);
  }

  const backend = await getBackend();
  const repo = await resolveRepoOption(options?.repo);
  const result = await backend.callTool('query', {
    query: queryText,
    task_context: options?.context,
    goal: options?.goal,
    limit: options?.limit ? parseInt(options.limit) : undefined,
    include_content: options?.content ?? false,
    response_profile: options?.responseProfile,
    scope_preset: options?.scopePreset,
    unity_resources: options?.unityResources,
    unity_hydration_mode: options?.unityHydration,
    unity_evidence_mode: options?.unityEvidence,
    resource_path_prefix: options?.resourcePathPrefix,
    resource_seed_mode: options?.resourceSeedMode,
    runtime_chain_verify: options?.runtimeChainVerify,
    repo,
  });
  output(result);
}

export async function contextCommand(name: string, options?: {
  repo?: string;
  file?: string;
  uid?: string;
  content?: boolean;
  responseProfile?: 'slim' | 'full';
  unityResources?: UnityResourcesMode;
  unityHydration?: UnityHydrationMode;
  unityEvidence?: UnityEvidenceMode;
  resourcePathPrefix?: string;
  resourceSeedMode?: 'strict' | 'balanced';
  runtimeChainVerify?: 'off' | 'on-demand';
}): Promise<void> {
  if (!name?.trim() && !options?.uid) {
    cliError('Usage: gitnexus context <symbol_name> [--uid <uid>] [--file <path>]');
    process.exit(1);
  }

  const backend = await getBackend();
  const repo = await resolveRepoOption(options?.repo);
  const result = await backend.callTool('context', {
    name: name || undefined,
    uid: options?.uid,
    file_path: options?.file,
    include_content: options?.content ?? false,
    response_profile: options?.responseProfile,
    unity_resources: options?.unityResources,
    unity_hydration_mode: options?.unityHydration,
    unity_evidence_mode: options?.unityEvidence,
    resource_path_prefix: options?.resourcePathPrefix,
    resource_seed_mode: options?.resourceSeedMode,
    runtime_chain_verify: options?.runtimeChainVerify,
    repo,
  });
  output(result);
}

export async function impactCommand(target: string, options?: {
  direction?: string;
  repo?: string;
  depth?: string;
  uid?: string;
  file?: string;
  minConfidence?: string;
  includeTests?: boolean;
}): Promise<void> {
  if (!target?.trim()) {
    cliError('Usage: gitnexus impact <symbol_name> [--direction upstream|downstream]');
    process.exit(1);
  }

  try {
    const backend = await getBackend();
    const repo = await resolveRepoOption(options?.repo);
    const result = await backend.callTool('impact', {
      target,
      target_uid: options?.uid,
      file_path: options?.file,
      direction: options?.direction || 'upstream',
      maxDepth: options?.depth ? parseInt(options.depth, 10) : undefined,
      minConfidence: options?.minConfidence ? parseFloat(options.minConfidence) : undefined,
      includeTests: options?.includeTests ?? false,
      repo,
    });
    output(result);
  } catch (err: unknown) {
    // Belt-and-suspenders: catch infrastructure failures (getBackend, callTool transport)
    // The backend's impact() already returns structured errors for graph query failures
    output({
      error:
        (err instanceof Error ? err.message : String(err)) || 'Impact analysis failed unexpectedly',
      target: { name: target },
      direction: options?.direction || 'upstream',
      suggestion: 'Try reducing --depth or using gitnexus context <symbol> as a fallback',
    });
  }
}

export async function cypherCommand(
  query: string,
  options?: {
    repo?: string;
  },
): Promise<void> {
  if (!query?.trim()) {
    cliError('Usage: gitnexus cypher <cypher_query>');
    process.exit(1);
  }

  const backend = await getBackend();
  const repo = await resolveRepoOption(options?.repo);
  const result = await backend.callTool('cypher', {
    query,
    repo,
  });
  output(result);
}

export async function unityUiTraceCommand(target: string, options?: {
  repo?: string;
  goal?: string;
  selectorMode?: string;
}, deps?: {
  backend?: { callTool: (method: string, params: any) => Promise<any> };
  output?: (data: any) => void;
}): Promise<void> {
  if (!target?.trim()) {
    console.error('Usage: gitnexus unity-ui-trace <target> --goal asset_refs|template_refs|selector_bindings');
    process.exit(1);
  }

  const goal = String(options?.goal || 'asset_refs').trim();
  if (!isUnityUiTraceGoal(goal)) {
    console.error('Invalid --goal. Use one of: asset_refs, template_refs, selector_bindings');
    process.exit(1);
  }
  const selectorMode = String(options?.selectorMode || 'balanced').trim();
  if (!isUnityUiSelectorMode(selectorMode)) {
    console.error('Invalid --selector-mode. Use one of: strict, balanced');
    process.exit(1);
  }

  const backend = deps?.backend || await getBackend();
  const repo = await resolveRepoOption(options?.repo);
  const result = await backend.callTool('unity_ui_trace', {
    target,
    goal,
    selector_mode: selectorMode,
    repo,
  });
  (deps?.output || output)(result);
}
