import { cliError } from "./cli-message.js";
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
    console.error('GitNexus: No indexed repositories found. Run: gitnexus analyze');
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
    console.error('Usage: gitnexus query <search_query>');
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
    console.error('Usage: gitnexus context <symbol_name> [--uid <uid>] [--file <path>]');
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
    console.error('Usage: gitnexus impact <symbol_name> [--direction upstream|downstream]');
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
      error: (err instanceof Error ? err.message : String(err)) || 'Impact analysis failed unexpectedly',
      target: { name: target },
      direction: options?.direction || 'upstream',
      suggestion: 'Try reducing --depth or using gitnexus context <symbol> as a fallback',
    });
  }
}

export async function cypherCommand(query: string, options?: {
  repo?: string;
}): Promise<void> {
  if (!query?.trim()) {
    console.error('Usage: gitnexus cypher <cypher_query>');
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

interface DetectChangesOptions {
  scope?: string;
  baseRef?: string;
  repo?: string;
}

function renderChangesList(symbols: Array<{
  type?: string;
  name: string;
  change_type?: string;
  filePath?: string;
}>): string {
  return symbols
    .map((s) => {
      const typeLabel = s.type ? `${s.type} ` : "";
      return `  ${typeLabel}${s.name} → ${s.filePath || ""}`;
    })
    .join('\n');
}

function renderProcesses(processes: Array<{
  name: string;
  step_count?: number;
  changed_steps?: Array<{ symbol?: string }>;
}>): string {
  const lines: string[] = [];
  for (const proc of processes.slice(0, 10)) {
    const stepInfo = proc.step_count && proc.step_count > 0 ? ` (${proc.step_count} steps)` : '';
    const stepList = proc.changed_steps?.slice(0, 5).map((s) => s.symbol).filter(Boolean).join(', ') || '';
    lines.push(`  ● ${proc.name}${stepInfo}`);
    if (stepList) lines.push(`    Changed: ${stepList}`);
  }
  if (processes.length > 10) {
    lines.push(`  ... and ${processes.length - 10} more affected processes`);
  }
  return lines.join('\n');
}

export async function detectChangesCommand(options?: DetectChangesOptions): Promise<void> {
  const backend = await getBackend();
  const repo = await resolveRepoOption(options?.repo);
  const result = await backend.callTool('detect_changes', {
    scope: options?.scope,
    base_ref: options?.baseRef,
    repo,
  });

  if (result.error) {
    output(`Error: ${result.error}`);
    return;
  }

  const summary = result.summary as {
    changed_files?: number;
    changed_count?: number;
    affected_count?: number;
    risk_level?: string;
  } | undefined;

  if (!summary || summary.changed_count === 0) {
    output('No changes detected.');
    return;
  }

  const lines: string[] = [
    `Change summary:`,
    `  Files changed: ${summary.changed_files ?? 0}`,
    `  Symbols changed: ${summary.changed_count ?? 0}`,
    `  Affected processes: ${summary.affected_count ?? 0}`,
    `  Risk level: ${summary.risk_level ?? 'unknown'}`,
  ];

  const symbols = result.changed_symbols as Array<{
    type?: string;
    name: string;
    change_type?: string;
    filePath?: string;
  }> | undefined;
  if (symbols && symbols.length > 0) {
    const displaySymbols = symbols.slice(0, 15);
    lines.push('', 'Changed symbols:', renderChangesList(displaySymbols));
    if (symbols.length > 15) {
      lines.push(`  ... and ${symbols.length - 15} more`);
    }
  }

  const processes = result.affected_processes as Array<{
    name: string;
    step_count?: number;
    changed_steps?: Array<{ symbol?: string }>;
  }> | undefined;
  if (processes && processes.length > 0) {
    lines.push('', 'Affected processes:', renderProcesses(processes));
  }

  output(lines.join('\n'));
}
