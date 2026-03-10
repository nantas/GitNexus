#!/usr/bin/env node

// Raise Node heap limit for large repos (e.g. Linux kernel).
// Must run before any heavy allocation. If already set by the user, respect it.
if (!process.env.NODE_OPTIONS?.includes('--max-old-space-size')) {
  const execArgv = process.execArgv.join(' ');
  if (!execArgv.includes('--max-old-space-size')) {
    // Re-spawn with a larger heap (8 GB)
    const { execFileSync } = await import('node:child_process');
    try {
      execFileSync(process.execPath, ['--max-old-space-size=8192', ...process.argv.slice(1)], {
        stdio: 'inherit',
        env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=8192`.trim() },
      });
      process.exit(0);
    } catch (e: any) {
      // If the child exited with an error code, propagate it
      process.exit(e.status ?? 1);
    }
  }
}

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeCommand } from './analyze.js';
import { serveCommand } from './serve.js';
import { listCommand } from './list.js';
import { statusCommand } from './status.js';
import { mcpCommand } from './mcp.js';
import { cleanCommand } from './clean.js';
import { setupCommand } from './setup.js';
import { augmentCommand } from './augment.js';
import { wikiCommand } from './wiki.js';
import { queryCommand, contextCommand, impactCommand, cypherCommand } from './tool.js';
import { evalServerCommand } from './eval-server.js';
import { benchmarkUnityCommand } from './benchmark-unity.js';
import { benchmarkAgentContextCommand } from './benchmark-agent-context.js';
import { unityBindingsCommand } from './unity-bindings.js';
import { benchmarkU2E2ECommand } from './benchmark-u2-e2e.js';

function resolveCliVersion(): string {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const packageJsonPath = path.resolve(path.dirname(currentFile), '..', '..', 'package.json');
    const raw = fs.readFileSync(packageJsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as { version?: string };
    if (typeof parsed.version === 'string' && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    // fall through to default
  }
  return '0.0.0';
}

const program = new Command();
const collectValues = (value: string, previous: string[]) => [...previous, value];

program
  .name('gitnexus')
  .description('GitNexus local CLI and MCP server')
  .version(resolveCliVersion());

program
  .command('setup')
  .description('One-time setup: configure MCP for a selected coding agent (claude/opencode/codex)')
  .option('--scope <scope>', 'Install target: global (default) or project')
  .option('--agent <agent>', 'Target coding agent: claude, opencode, or codex')
  .action(setupCommand);

program
  .command('analyze [path]')
  .description('Index a repository (full analysis)')
  .option('-f, --force', 'Force full re-index even if up to date')
  .option('--embeddings', 'Enable embedding generation for semantic search (off by default)')
  .option('--extensions <list>', 'Comma-separated file extensions to include (e.g. .cs,.ts)')
  .option('--repo-alias <name>', 'Override indexed repository name with a stable alias')
  .option(
    '--scope-manifest <path>',
    'Manifest file with scope rules (supports comments and * wildcard; recommended: .gitnexus/sync-manifest.txt)',
  )
  .option('--scope-prefix <pathPrefix>', 'Add a scope path prefix rule (repeatable)', collectValues, [])
  .action(analyzeCommand);

program
  .command('serve')
  .description('Start local HTTP server for web UI connection')
  .option('-p, --port <port>', 'Port number', '4747')
  .option('--host <host>', 'Bind address (default: 127.0.0.1, use 0.0.0.0 for remote access)')
  .action(serveCommand);

program
  .command('mcp')
  .description('Start MCP server (stdio) — serves all indexed repos')
  .action(mcpCommand);

program
  .command('list')
  .description('List all indexed repositories')
  .action(listCommand);

program
  .command('status')
  .description('Show index status for current repo')
  .action(statusCommand);

program
  .command('clean')
  .description('Delete GitNexus index for current repo')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('--all', 'Clean all indexed repos')
  .action(cleanCommand);

program
  .command('wiki [path]')
  .description('Generate repository wiki from knowledge graph')
  .option('-f, --force', 'Force full regeneration even if up to date')
  .option('--model <model>', 'LLM model name (default: minimax/minimax-m2.5)')
  .option('--base-url <url>', 'LLM API base URL (default: OpenAI)')
  .option('--api-key <key>', 'LLM API key (saved to ~/.gitnexus/config.json)')
  .option('--concurrency <n>', 'Parallel LLM calls (default: 3)', '3')
  .option('--gist', 'Publish wiki as a public GitHub Gist after generation')
  .action(wikiCommand);

program
  .command('augment <pattern>')
  .description('Augment a search pattern with knowledge graph context (used by hooks)')
  .action(augmentCommand);

// ─── Direct Tool Commands (no MCP overhead) ────────────────────────
// These invoke LocalBackend directly for use in eval, scripts, and CI.

program
  .command('query <search_query>')
  .description('Search the knowledge graph for execution flows related to a concept')
  .option('-r, --repo <name>', 'Target repository (omit if only one indexed)')
  .option('-c, --context <text>', 'Task context to improve ranking')
  .option('-g, --goal <text>', 'What you want to find')
  .option('-l, --limit <n>', 'Max processes to return (default: 5)')
  .option('--content', 'Include full symbol source code')
  .option('--unity-resources <mode>', 'Unity resource retrieval mode: off|on|auto', 'off')
  .action(queryCommand);

program
  .command('context [name]')
  .description('360-degree view of a code symbol: callers, callees, processes')
  .option('-r, --repo <name>', 'Target repository')
  .option('-u, --uid <uid>', 'Direct symbol UID (zero-ambiguity lookup)')
  .option('-f, --file <path>', 'File path to disambiguate common names')
  .option('--content', 'Include full symbol source code')
  .option('--unity-resources <mode>', 'Unity resource retrieval mode: off|on|auto', 'off')
  .action(contextCommand);

program
  .command('unity-bindings <symbol>')
  .description('Experimental: inspect Unity resource bindings for a C# symbol')
  .option('--target-path <path>', 'Unity project root (default: cwd)')
  .option('--json', 'Output JSON')
  .action(async (symbol, options) => {
    await unityBindingsCommand(symbol, options);
  });

program
  .command('impact <target>')
  .description('Blast radius analysis: what breaks if you change a symbol')
  .option('-d, --direction <dir>', 'upstream (dependants) or downstream (dependencies)', 'upstream')
  .option('-r, --repo <name>', 'Target repository')
  .option('-u, --uid <uid>', 'Exact target UID (disambiguates same-name symbols)')
  .option('-f, --file <path>', 'File path filter to disambiguate target name')
  .option('--depth <n>', 'Max relationship depth (default: 3)')
  .option('--min-confidence <n>', 'Minimum edge confidence 0-1 (default: 0.3)')
  .option('--include-tests', 'Include test files in results')
  .action(impactCommand);

program
  .command('cypher <query>')
  .description('Execute raw Cypher query against the knowledge graph')
  .option('-r, --repo <name>', 'Target repository')
  .action(cypherCommand);

// ─── Eval Server (persistent daemon for SWE-bench) ─────────────────

program
  .command('eval-server')
  .description('Start lightweight HTTP server for fast tool calls during evaluation')
  .option('-p, --port <port>', 'Port number', '4848')
  .option('--idle-timeout <seconds>', 'Auto-shutdown after N seconds idle (0 = disabled)', '0')
  .action(evalServerCommand);

program
  .command('benchmark-unity <dataset>')
  .description('Run Unity accuracy baseline and hard-gated regression checks')
  .option('-p, --profile <profile>', 'quick or full', 'quick')
  .option('-r, --repo <name>', 'Target indexed repo')
  .option('--repo-alias <name>', 'Analyze-time repo alias and default evaluation repo when --repo is omitted')
  .option('--target-path <path>', 'Path to analyze before evaluation (required unless --skip-analyze)')
  .option('--report-dir <path>', 'Output directory for benchmark-report.json and benchmark-summary.md', '.gitnexus/benchmark')
  .option('--extensions <list>', 'Analyze extension filter (default: .cs)', '.cs')
  .option('--scope-manifest <path>', 'Analyze scope manifest file')
  .option('--scope-prefix <pathPrefix>', 'Analyze scope path prefix (repeatable)', collectValues, [])
  .option('--skip-analyze', 'Skip analyze stage and evaluate current index only')
  .action(benchmarkUnityCommand);

program
  .command('benchmark-agent-context <dataset>')
  .description('Run scenario-based agent refactor context benchmark')
  .option('-p, --profile <profile>', 'quick or full', 'quick')
  .option('-r, --repo <name>', 'Target indexed repo')
  .option('--repo-alias <name>', 'Analyze-time repo alias and default evaluation repo when --repo is omitted')
  .option('--target-path <path>', 'Path to analyze before evaluation (required unless --skip-analyze)')
  .option(
    '--report-dir <path>',
    'Output directory for benchmark-report.json and benchmark-summary.md',
    '.gitnexus/benchmark-agent-context',
  )
  .option('--extensions <list>', 'Analyze extension filter (default: .cs)', '.cs')
  .option('--scope-manifest <path>', 'Analyze scope manifest file')
  .option('--scope-prefix <pathPrefix>', 'Analyze scope path prefix (repeatable)', collectValues, [])
  .option('--skip-analyze', 'Skip analyze stage and evaluate current index only')
  .action(async (dataset, options) => {
    await benchmarkAgentContextCommand(dataset, options);
  });

program
  .command('benchmark-u2-e2e')
  .description('Run fail-fast full neonspark U2 E2E benchmark and emit evidence reports')
  .option('--config <path>', 'Path to E2E config JSON')
  .option('--report-dir <path>', 'Output directory for reports')
  .action(async (options) => {
    await benchmarkU2E2ECommand(options);
  });

program.parse(process.argv);
