/**
 * Setup Command
 * 
 * One-time MCP configuration writer with explicit agent targeting.
 * Configures only the selected coding agent's MCP entry
 * in either global or project scope.
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'url';
import { getGlobalDir, loadCLIConfig, saveCLIConfig } from '../storage/repo-manager.js';
import { getGitRoot } from '../storage/git.js';
import { glob } from 'glob';
import { resolveCliSpec } from '../config/cli-spec.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

interface SetupResult {
  configured: string[];
  skipped: string[];
  errors: string[];
}

type SetupScope = 'global' | 'project';

interface SetupOptions {
  scope?: string;
  agent?: string;
  cliVersion?: string;
  cliSpec?: string;
}

interface McpEntry {
  command: string;
  args: string[];
}

type SetupAgent = 'claude' | 'opencode' | 'codex';
const LEGACY_CURSOR_AGENT = 'cursor';

function resolveSetupScope(rawScope?: string): SetupScope {
  if (!rawScope || rawScope.trim() === '') return 'global';
  if (rawScope === 'global' || rawScope === 'project') return rawScope;
  throw new Error(`Invalid --scope value "${rawScope}". Use "global" or "project".`);
}

function resolveSetupAgent(rawAgent?: string): SetupAgent {
  if (!rawAgent || rawAgent.trim() === '') {
    return 'claude';
  }
  if (rawAgent === 'claude' || rawAgent === 'opencode' || rawAgent === 'codex') {
    return rawAgent;
  }
  throw new Error(`Invalid --agent value "${rawAgent}". Use "claude", "opencode", or "codex".`);
}

async function installLegacyCursorSkills(result: SetupResult): Promise<void> {
  const skillsDir = path.join(os.homedir(), '.cursor', 'skills');
  try {
    const installed = await installSkillsTo(skillsDir);
    if (installed.length > 0) {
      result.configured.push(`Cursor skills (${installed.length} skills → ~/.cursor/skills/)`);
    }
  } catch (err: any) {
    result.errors.push(`Cursor skills: ${err.message}`);
  }
}

/**
 * The MCP server entry for all editors.
 * Uses the locally installed gitnexus binary.
 */
function getMcpEntry(): McpEntry {
  if (process.platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/c', 'gitnexus', 'mcp'],
    };
  }
  return {
    command: 'gitnexus',
    args: ['mcp'],
  };
}

function getOpenCodeMcpEntry() {
  const entry = getMcpEntry();
  return {
    type: 'local',
    command: [entry.command, ...entry.args],
  };
}

/**
 * Merge gitnexus entry into an existing MCP config JSON object.
 * Returns the updated config.
 */
function mergeMcpConfig(existing: any): any {
  if (!existing || typeof existing !== 'object') {
    existing = {};
  }
  if (!existing.mcpServers || typeof existing.mcpServers !== 'object') {
    existing.mcpServers = {};
  }
  existing.mcpServers.gitnexus = getMcpEntry();
  return existing;
}

/**
 * Merge gitnexus entry into an OpenCode config JSON object.
 * Returns the updated config.
 */
function mergeOpenCodeConfig(existing: any): any {
  if (!existing || typeof existing !== 'object') {
    existing = {};
  }
  if (!existing.mcp || typeof existing.mcp !== 'object') {
    existing.mcp = {};
  }
  existing.mcp.gitnexus = getOpenCodeMcpEntry();
  return existing;
}

/**
 * Try to read a JSON file, returning null if it doesn't exist or is invalid.
 */
async function readJsonFile(filePath: string): Promise<any | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write JSON to a file, creating parent directories if needed.
 */
async function writeJsonFile(filePath: string, data: any): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/**
 * Check if a directory exists
 */
async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a regular file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Escape a value for TOML string literals.
 */
function toTomlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildCodexMcpTable(): string {
  const entry = getMcpEntry();
  return [
    '[mcp_servers.gitnexus]',
    `command = ${toTomlString(entry.command)}`,
    `args = [${entry.args.map(toTomlString).join(', ')}]`,
  ].join('\n');
}

function mergeCodexConfig(existingRaw: string): string {
  const table = buildCodexMcpTable();
  const normalized = existingRaw.replace(/\r\n/g, '\n');
  const tablePattern = /^\[mcp_servers\.gitnexus\][\s\S]*?(?=^\[[^\]]+\]|(?![\s\S]))/m;

  if (tablePattern.test(normalized)) {
    // Keep exactly one table by replacing the whole previous section block.
    return normalized.replace(tablePattern, `${table}\n\n`).trimEnd() + '\n';
  }

  const trimmed = normalized.trimEnd();
  if (trimmed.length === 0) return `${table}\n`;
  return `${trimmed}\n\n${table}\n`;
}

async function resolveOpenCodeConfigPath(opencodeDir: string): Promise<string> {
  const preferredPath = path.join(opencodeDir, 'opencode.json');
  const legacyPath = path.join(opencodeDir, 'config.json');

  if (await fileExists(preferredPath)) return preferredPath;
  if (await fileExists(legacyPath)) return legacyPath;
  return preferredPath;
}

// ─── Editor-specific setup ─────────────────────────────────────────

async function setupCursor(result: SetupResult): Promise<void> {
  const cursorDir = path.join(os.homedir(), '.cursor');
  if (!(await dirExists(cursorDir))) {
    result.skipped.push('Cursor (not installed)');
    return;
  }

  const mcpPath = path.join(cursorDir, 'mcp.json');
  try {
    const existing = await readJsonFile(mcpPath);
    const updated = mergeMcpConfig(existing);
    await writeJsonFile(mcpPath, updated);
    result.configured.push('Cursor');
  } catch (err: any) {
    result.errors.push(`Cursor: ${err.message}`);
  }
}

async function setupClaudeCode(result: SetupResult): Promise<void> {
  const claudeDir = path.join(os.homedir(), '.claude');
  const hasClaude = await dirExists(claudeDir);

  if (!hasClaude) {
    result.skipped.push('Claude Code (not installed)');
    return;
  }

  // Claude Code uses a JSON settings file at ~/.claude.json or claude mcp add
  console.log('');
  console.log('  Claude Code detected. Run this command to add GitNexus MCP:');
  console.log('');
  console.log(`    claude mcp add gitnexus -- gitnexus mcp`);
  console.log('');
  result.configured.push('Claude Code (MCP manual step printed)');
}

/**
 * Install GitNexus global skills to ~/.agents/skills/gitnexus/
 * Users can create editor-specific symlinks if they want.
 */
async function installGlobalAgentSkills(result: SetupResult): Promise<void> {
  const skillsDir = path.join(os.homedir(), '.agents', 'skills', 'gitnexus');
  try {
    const installed = await installSkillsTo(skillsDir);
    if (installed.length > 0) {
      result.configured.push(`Global agent skills (${installed.length} skills → ~/.agents/skills/gitnexus/)`);
    }
  } catch (err: any) {
    result.errors.push(`Global agent skills: ${err.message}`);
  }
}

async function installProjectAgentSkills(repoRoot: string, result: SetupResult): Promise<void> {
  const skillsDir = path.join(repoRoot, '.agents', 'skills', 'gitnexus');
  try {
    const installed = await installSkillsTo(skillsDir);
    if (installed.length > 0) {
      result.configured.push(`Project agent skills (${installed.length} skills → ${path.relative(repoRoot, skillsDir)}/)`);
    }
  } catch (err: any) {
    result.errors.push(`Project agent skills: ${err.message}`);
  }
}

/**
 * Install GitNexus hooks to ~/.claude/settings.json for Claude Code.
 * Merges hook config without overwriting existing hooks.
 */
async function installClaudeCodeHooks(result: SetupResult): Promise<void> {
  const claudeDir = path.join(os.homedir(), '.claude');
  if (!(await dirExists(claudeDir))) return;

  const settingsPath = path.join(claudeDir, 'settings.json');

  // Source hooks bundled within the gitnexus package (hooks/claude/)
  const pluginHooksPath = path.join(__dirname, '..', '..', 'hooks', 'claude');

  // Copy unified hook script to ~/.claude/hooks/gitnexus/
  const destHooksDir = path.join(claudeDir, 'hooks', 'gitnexus');

  try {
    await fs.mkdir(destHooksDir, { recursive: true });

    const src = path.join(pluginHooksPath, 'gitnexus-hook.cjs');
    const dest = path.join(destHooksDir, 'gitnexus-hook.cjs');
    try {
      let content = await fs.readFile(src, 'utf-8');
      // Inject resolved CLI path so the copied hook can find the CLI
      // even when it's no longer inside the npm package tree
      const resolvedCli = path.join(__dirname, '..', 'cli', 'index.js');
      const normalizedCli = path.resolve(resolvedCli).replace(/\\/g, '/');
      const jsonCli = JSON.stringify(normalizedCli);
      content = content.replace(
        "let cliPath = path.resolve(__dirname, '..', '..', 'dist', 'cli', 'index.js');",
        `let cliPath = ${jsonCli};`
      );
      await fs.writeFile(dest, content, 'utf-8');
    } catch {
      // Script not found in source — skip
    }

    const hookPath = path.join(destHooksDir, 'gitnexus-hook.cjs').replace(/\\/g, '/');
    const hookCmd = `node "${hookPath.replace(/"/g, '\\"')}"`;

    // Merge hook config into ~/.claude/settings.json
    const existing = await readJsonFile(settingsPath) || {};
    if (!existing.hooks) existing.hooks = {};

    // NOTE: SessionStart hooks are broken on Windows (Claude Code bug #23576).
    // Session context is delivered via CLAUDE.md / skills instead.

    // Helper: add a hook entry if one with 'gitnexus-hook' isn't already registered
    interface HookEntry { hooks?: Array<{ command?: string }> }
    function ensureHookEntry(
      eventName: string,
      matcher: string,
      timeout: number,
      statusMessage: string,
    ) {
      if (!existing.hooks[eventName]) existing.hooks[eventName] = [];
      const hasHook = existing.hooks[eventName].some(
        (h: HookEntry) => h.hooks?.some(hh => hh.command?.includes('gitnexus-hook'))
      );
      if (!hasHook) {
        existing.hooks[eventName].push({
          matcher,
          hooks: [{ type: 'command', command: hookCmd, timeout, statusMessage }],
        });
      }
    }

    ensureHookEntry('PreToolUse', 'Grep|Glob|Bash', 10, 'Enriching with GitNexus graph context...');
    ensureHookEntry('PostToolUse', 'Bash', 10, 'Checking GitNexus index freshness...');

    await writeJsonFile(settingsPath, existing);
    result.configured.push('Claude Code hooks (PreToolUse, PostToolUse)');
  } catch (err: any) {
    result.errors.push(`Claude Code hooks: ${err.message}`);
  }
}

async function setupOpenCode(result: SetupResult): Promise<void> {
  const opencodeDir = path.join(os.homedir(), '.config', 'opencode');
  if (!(await dirExists(opencodeDir))) {
    result.skipped.push('OpenCode (not installed)');
    return;
  }

  const configPath = await resolveOpenCodeConfigPath(opencodeDir);
  try {
    const existing = await readJsonFile(configPath);
    const config = mergeOpenCodeConfig(existing);
    await writeJsonFile(configPath, config);
    result.configured.push(`OpenCode (${path.basename(configPath)})`);
  } catch (err: any) {
    result.errors.push(`OpenCode: ${err.message}`);
  }
}

async function setupCodex(result: SetupResult): Promise<void> {
  const entry = getMcpEntry();

  try {
    await execFileAsync(
      'codex',
      ['mcp', 'add', 'gitnexus', '--', entry.command, ...entry.args],
      { timeout: 15000 }
    );
    result.configured.push('Codex');
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      result.skipped.push('Codex (not installed)');
      return;
    }
    result.errors.push(`Codex: ${err.message}`);
  }
}

async function setupProjectMcp(repoRoot: string, result: SetupResult): Promise<void> {
  const mcpPath = path.join(repoRoot, '.mcp.json');
  try {
    const existing = await readJsonFile(mcpPath);
    const updated = mergeMcpConfig(existing);
    await writeJsonFile(mcpPath, updated);
    result.configured.push(`Project MCP (${path.relative(repoRoot, mcpPath)})`);
  } catch (err: any) {
    result.errors.push(`Project MCP: ${err.message}`);
  }
}

async function setupProjectCodex(repoRoot: string, result: SetupResult): Promise<void> {
  const codexConfigPath = path.join(repoRoot, '.codex', 'config.toml');
  try {
    let existingRaw = '';
    try {
      existingRaw = await fs.readFile(codexConfigPath, 'utf-8');
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err;
    }

    const merged = mergeCodexConfig(existingRaw);
    await fs.mkdir(path.dirname(codexConfigPath), { recursive: true });
    await fs.writeFile(codexConfigPath, merged, 'utf-8');
    result.configured.push(`Project Codex MCP (${path.relative(repoRoot, codexConfigPath)})`);
  } catch (err: any) {
    result.errors.push(`Project Codex MCP: ${err.message}`);
  }
}

async function setupProjectOpenCode(repoRoot: string, result: SetupResult): Promise<void> {
  const opencodePath = path.join(repoRoot, 'opencode.json');
  try {
    const existing = await readJsonFile(opencodePath);
    const merged = mergeOpenCodeConfig(existing);
    await writeJsonFile(opencodePath, merged);
    result.configured.push(`Project OpenCode MCP (${path.relative(repoRoot, opencodePath)})`);
  } catch (err: any) {
    result.errors.push(`Project OpenCode MCP: ${err.message}`);
  }
}

function extractVersionFromPackageSpec(packageSpec: string): string | undefined {
  const trimmed = packageSpec.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('@')) {
    const at = trimmed.indexOf('@', 1);
    return at > 0 ? trimmed.slice(at + 1) : undefined;
  }
  const at = trimmed.lastIndexOf('@');
  return at > 0 ? trimmed.slice(at + 1) : undefined;
}

async function saveSetupConfig(scope: SetupScope, packageSpec: string, result: SetupResult): Promise<void> {
  try {
    const existing = await loadCLIConfig();
    await saveCLIConfig({
      ...existing,
      setupScope: scope,
      cliPackageSpec: packageSpec,
      cliVersion: extractVersionFromPackageSpec(packageSpec),
    });
    result.configured.push(`Default setup scope (${scope})`);
    result.configured.push(`CLI package spec (${packageSpec})`);
  } catch (err: any) {
    result.errors.push(`Persist setup scope: ${err.message}`);
  }
}

// ─── Skill Installation ───────────────────────────────────────────

/**
 * Install GitNexus skills to a target directory.
 * Each skill is installed as {targetDir}/{skillName}/SKILL.md.
 *
 * Supports two source layouts:
 *   - Flat file:  skills/{name}.md           → copied as SKILL.md
 *   - Directory:  skills/{name}/SKILL.md     → copied recursively (includes references/, etc.)
 */
async function installSkillsTo(targetDir: string): Promise<string[]> {
  const installed: string[] = [];
  const skillsRoot = path.join(__dirname, '..', '..', 'skills');

  let flatFiles: string[] = [];
  let dirSkillFiles: string[] = [];
  try {
    [flatFiles, dirSkillFiles] = await Promise.all([
      glob('*.md', { cwd: skillsRoot }),
      glob('*/SKILL.md', { cwd: skillsRoot }),
    ]);
  } catch {
    return [];
  }

  const skillSources = new Map<string, { isDirectory: boolean }>();

  for (const relPath of dirSkillFiles) {
    skillSources.set(path.dirname(relPath), { isDirectory: true });
  }
  for (const relPath of flatFiles) {
    const skillName = path.basename(relPath, '.md');
    if (!skillSources.has(skillName)) {
      skillSources.set(skillName, { isDirectory: false });
    }
  }

  for (const [skillName, source] of skillSources) {
    const skillDir = path.join(targetDir, skillName);

    try {
      if (source.isDirectory) {
        const dirSource = path.join(skillsRoot, skillName);
        await copyDirRecursive(dirSource, skillDir);
        installed.push(skillName);
      } else {
        const flatSource = path.join(skillsRoot, `${skillName}.md`);
        const content = await fs.readFile(flatSource, 'utf-8');
        await fs.mkdir(skillDir, { recursive: true });
        await fs.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
        installed.push(skillName);
      }
    } catch {
      // Source skill not found — skip
    }
  }

  // Shared workflow contracts distributed alongside skills.
  const sharedSource = path.join(skillsRoot, '_shared');
  try {
    await fs.access(sharedSource);
    await copyDirRecursive(sharedSource, path.join(targetDir, '_shared'));
  } catch {
    // Optional shared contracts directory may be absent in older packages.
  }

  return installed;
}

/**
 * Recursively copy a directory tree.
 */
async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// ─── Main command ──────────────────────────────────────────────────

export const setupCommand = async (options: SetupOptions = {}) => {
  console.log('');
  console.log('  GitNexus Setup');
  console.log('  ==============');
  console.log('');

  if (options.cliSpec && options.cliVersion) {
    console.log('  Use either --cli-spec or --cli-version, not both.\n');
    process.exitCode = 1;
    return;
  }

  let scope: SetupScope;
  let agent: SetupAgent;
  const legacyCursorMode = !options.agent || options.agent.trim() === '';
  try {
    scope = resolveSetupScope(options.scope);
    agent = resolveSetupAgent(options.agent);
  } catch (err: any) {
    console.log(`  ${err?.message || String(err)}\n`);
    process.exitCode = 1;
    return;
  }

  // Ensure global directory exists
  const globalDir = getGlobalDir();
  await fs.mkdir(globalDir, { recursive: true });

  const existingConfig = await loadCLIConfig();
  const resolvedCliSpec = resolveCliSpec({
    explicitSpec: options.cliSpec,
    explicitVersion: options.cliVersion,
    config: existingConfig,
  });
  const mcpPackageSpec = resolvedCliSpec.packageSpec;

  const result: SetupResult = {
    configured: [],
    skipped: [],
    errors: [],
  };

  if (scope === 'global') {
    if (legacyCursorMode) {
      await setupCursor(result);
      await installLegacyCursorSkills(result);
      await saveSetupConfig(scope, mcpPackageSpec, result);
      agent = LEGACY_CURSOR_AGENT as SetupAgent;
    } else {
      // Configure only the selected agent MCP
      if (agent === 'claude') {
        await setupClaudeCode(result);
        // Claude-only hooks should only be installed when Claude is selected.
        await installClaudeCodeHooks(result);
      } else if (agent === 'opencode') {
        await setupOpenCode(result);
      } else if (agent === 'codex') {
        await setupCodex(result);
      }
      // Install shared global skills once
      await installGlobalAgentSkills(result);
      await saveSetupConfig(scope, mcpPackageSpec, result);
    }
  } else {
    const repoRoot = getGitRoot(process.cwd());
    if (!repoRoot) {
      console.log('  --scope project requires running inside a git repository\n');
      process.exitCode = 1;
      return;
    }
    if (agent === 'claude') {
      await setupProjectMcp(repoRoot, result);
    } else if (agent === 'codex') {
      await setupProjectCodex(repoRoot, result);
    } else if (agent === 'opencode') {
      await setupProjectOpenCode(repoRoot, result);
    }
    await installProjectAgentSkills(repoRoot, result);
    await saveSetupConfig(scope, mcpPackageSpec, result);
  }

  // Print results
  if (result.configured.length > 0) {
    console.log('  Configured:');
    for (const name of result.configured) {
      console.log(`    + ${name}`);
    }
  }

  if (result.skipped.length > 0) {
    console.log('');
    console.log('  Skipped:');
    for (const name of result.skipped) {
      console.log(`    - ${name}`);
    }
  }

  if (result.errors.length > 0) {
    console.log('');
    console.log('  Errors:');
    for (const err of result.errors) {
      console.log(`    ! ${err}`);
    }
  }

  console.log('');
  console.log('  Summary:');
  console.log(`    Scope: ${scope}`);
  console.log(`    Agent: ${legacyCursorMode ? LEGACY_CURSOR_AGENT : agent}`);
  console.log(`    CLI package spec: ${mcpPackageSpec}`);
  console.log(`    MCP configured for: ${result.configured.filter(c => !c.includes('skills')).join(', ') || 'none'}`);
  console.log(`    Skills installed to: ${result.configured.filter(c => c.includes('skills')).length > 0 ? result.configured.filter(c => c.includes('skills')).join(', ') : 'none'}`);
  console.log('');
  console.log('  Next steps:');
  console.log('    1. cd into any git repo');
  console.log('    2. Run: gitnexus analyze');
  console.log('    3. Open the repo in your editor — MCP is ready!');
  console.log('');
};
