#!/usr/bin/env node

// Heap re-spawn removed — only analyze.ts needs the 8GB heap (via its own ensureHeap()).
// Removing it from here improves MCP server startup time significantly.

import { Command } from 'commander';
import { createRequire } from 'node:module';
import { createLazyAction } from './lazy-action.js';
import { attachRuleLabCommands } from './rule-lab.js';

const _require = createRequire(import.meta.url);
const pkg = _require('../../package.json');
const program = new Command();
const collectValues = (value: string, previous: string[]) => [...previous, value];

program
  .name('gitnexus')
  .description('GitNexus local CLI and MCP server')
  .version(pkg.version);

program
  .command('setup')
  .description('One-time setup: configure MCP for a selected coding agent (claude/opencode/codex)')
  .option('--scope <scope>', 'Install target: global (default) or project')
  .option('--agent <agent>', 'Target coding agent: claude, opencode, or codex')
  .option('--cli-version <version>', 'Pin npx GitNexus version/tag for generated MCP commands (e.g. 1.4.7-rc)')
  .option('--cli-spec <spec>', 'Pin full npx package spec for generated MCP commands (e.g. @veewo/gitnexus@1.4.7-rc)')
  .action(createLazyAction(() => import('./setup.js'), 'setupCommand'));

program
  .command('analyze [path]')
  .description('Index a repository (full analysis)')
  .option('-f, --force', 'Force full re-index even if up to date')
  .option('--no-reuse-options', 'Do not reuse stored analyze options from previous index')
  .option('--embeddings', 'Enable embedding generation for semantic search (off by default)')
  .option('--extensions <list>', 'Comma-separated file extensions to include (e.g. .cs,.ts)')
  .option('--repo-alias <name>', 'Override indexed repository name with a stable alias')
  .option('--csharp-define-csproj <path>', 'Load C# DefineConstants from the specified .csproj and normalize conditional-compilation blocks before parsing')
  .option('--skills', 'Generate repo-specific skill files from detected communities')
  .option('-v, --verbose', 'Enable verbose ingestion warnings (default: false)')
  .addHelpText('after', '\nEnvironment variables:\n  GITNEXUS_NO_GITIGNORE=1  Skip .gitignore parsing (still reads .gitnexusignore)')
  .action(createLazyAction(() => import('./analyze.js'), 'analyzeCommand'));

program
  .command('serve')
  .description('Start local HTTP server for web UI connection')
  .option('-p, --port <port>', 'Port number', '4747')
  .option('--host <host>', 'Bind address (default: 127.0.0.1, use 0.0.0.0 for remote access)')
  .action(createLazyAction(() => import('./serve.js'), 'serveCommand'));

program
  .command('mcp')
  .description('Start MCP server (stdio) — serves all indexed repos')
  .action(createLazyAction(() => import('./mcp.js'), 'mcpCommand'));

program
  .command('list')
  .description('List all indexed repositories')
  .action(createLazyAction(() => import('./list.js'), 'listCommand'));

program
  .command('status')
  .description('Show index status for current repo')
  .action(createLazyAction(() => import('./status.js'), 'statusCommand'));

program
  .command('clean')
  .description('Delete GitNexus index for current repo')
  .option('-f, --force', 'Skip confirmation prompt')
  .option('--all', 'Clean all indexed repos')
  .action(createLazyAction(() => import('./clean.js'), 'cleanCommand'));

attachRuleLabCommands(program, (handlerName) =>
  createLazyAction(() => import('./rule-lab.js'), handlerName),
);

program
  .command('wiki [path]')
  .description('Generate repository wiki from knowledge graph')
  .option('-f, --force', 'Force full regeneration even if up to date')
  .option('--model <model>', 'LLM model name (default: minimax/minimax-m2.5)')
  .option('--base-url <url>', 'LLM API base URL (default: OpenAI)')
  .option('--api-key <key>', 'LLM API key (saved to ~/.gitnexus/config.json)')
  .option('--concurrency <n>', 'Parallel LLM calls (default: 3)', '3')
  .option('--gist', 'Publish wiki as a public GitHub Gist after generation')
  .action(createLazyAction(() => import('./wiki.js'), 'wikiCommand'));

program
  .command('augment <pattern>')
  .description('Augment a search pattern with knowledge graph context (used by hooks)')
  .action(createLazyAction(() => import('./augment.js'), 'augmentCommand'));

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
  .option('--response-profile <profile>', 'Response payload profile: slim|full', 'slim')
  .option('--scope-preset <preset>', 'Scope preset for retrieval: unity-gameplay|unity-all')
  .option('--unity-resources <mode>', 'Unity resource retrieval mode: off|on|auto', 'off')
  .option('--unity-hydration <mode>', 'Unity hydration mode when resources are enabled: parity|compact', 'compact')
  .option('--unity-evidence <mode>', 'Unity evidence payload mode: summary|focused|full', 'summary')
  .option('--resource-path-prefix <path>', 'Filter or seed Unity resource evidence by path prefix')
  .option('--resource-seed-mode <mode>', 'Resource seed mode for Unity hint ranking: strict|balanced', 'balanced')
  .option('--runtime-chain-verify <mode>', 'Runtime chain verification mode: off|on-demand', 'off')
  .action(createLazyAction(() => import('./tool.js'), 'queryCommand'));

program
  .command('context [name]')
  .description('360-degree view of a code symbol: callers, callees, processes')
  .option('-r, --repo <name>', 'Target repository')
  .option('-u, --uid <uid>', 'Direct symbol UID (zero-ambiguity lookup)')
  .option('-f, --file <path>', 'File path to disambiguate common names')
  .option('--content', 'Include full symbol source code')
  .option('--response-profile <profile>', 'Response payload profile: slim|full', 'slim')
  .option('--unity-resources <mode>', 'Unity resource retrieval mode: off|on|auto', 'off')
  .option('--unity-hydration <mode>', 'Unity hydration mode when resources are enabled: parity|compact', 'compact')
  .option('--unity-evidence <mode>', 'Unity evidence payload mode: summary|focused|full', 'summary')
  .option('--resource-path-prefix <path>', 'Filter or seed Unity resource evidence by path prefix')
  .option('--resource-seed-mode <mode>', 'Resource seed mode for Unity hint ranking: strict|balanced', 'balanced')
  .option('--runtime-chain-verify <mode>', 'Runtime chain verification mode: off|on-demand', 'off')
  .action(createLazyAction(() => import('./tool.js'), 'contextCommand'));

program
  .command('unity-bindings <symbol>')
  .description('Experimental: inspect Unity resource bindings for a C# symbol')
  .option('--target-path <path>', 'Unity project root (default: cwd)')
  .option('--json', 'Output JSON')
  .action(createLazyAction(() => import('./unity-bindings.js'), 'unityBindingsCommand'));

program
  .command('unity-ui-trace <target>')
  .description('Query-time Unity UI evidence tracing (asset_refs|template_refs|selector_bindings)')
  .option('-r, --repo <name>', 'Target repository (omit if only one indexed)')
  .option('--goal <goal>', 'Trace goal: asset_refs|template_refs|selector_bindings', 'asset_refs')
  .option('--selector-mode <mode>', 'Selector matching mode for selector_bindings: strict|balanced', 'balanced')
  .action(createLazyAction(() => import('./tool.js'), 'unityUiTraceCommand'));

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
  .action(createLazyAction(() => import('./tool.js'), 'impactCommand'));

program
  .command('cypher <query>')
  .description('Execute raw Cypher query against the knowledge graph')
  .option('-r, --repo <name>', 'Target repository')
  .action(createLazyAction(() => import('./tool.js'), 'cypherCommand'));

// ─── Eval Server (persistent daemon for SWE-bench) ─────────────────

program
  .command('eval-server')
  .description('Start lightweight HTTP server for fast tool calls during evaluation')
  .option('-p, --port <port>', 'Port number', '4848')
  .option('--idle-timeout <seconds>', 'Auto-shutdown after N seconds idle (0 = disabled)', '0')
  .action(createLazyAction(() => import('./eval-server.js'), 'evalServerCommand'));

program
  .command('benchmark-unity <dataset>')
  .description('Run Unity accuracy baseline and hard-gated regression checks')
  .option('-p, --profile <profile>', 'quick or full', 'quick')
  .option('-r, --repo <name>', 'Target indexed repo')
  .option('--repo-alias <name>', 'Analyze-time repo alias and default evaluation repo when --repo is omitted')
  .option('--target-path <path>', 'Path to analyze before evaluation (required unless --skip-analyze)')
  .option('--report-dir <path>', 'Output directory for benchmark-report.json and benchmark-summary.md', '.gitnexus/benchmark')
  .option('--extensions <list>', 'Analyze extension filter (comma-separated, optional)')
  .option('--skip-analyze', 'Skip analyze stage and evaluate current index only')
  .action(createLazyAction(() => import('./benchmark-unity.js'), 'benchmarkUnityCommand'));

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
  .option('--extensions <list>', 'Analyze extension filter (comma-separated, optional)')
  .option('--skip-analyze', 'Skip analyze stage and evaluate current index only')
  .action(createLazyAction(() => import('./benchmark-agent-context.js'), 'benchmarkAgentContextCommand'));

program
  .command('benchmark-agent-safe-query-context <dataset>')
  .description('Run the agent-safe Unity query/context benchmark')
  .option('-r, --repo <name>', 'Target indexed repo')
  .option('--repo-alias <name>', 'Analyze-time repo alias and default evaluation repo when --repo is omitted')
  .option('--target-path <path>', 'Path to analyze before evaluation (required unless --skip-analyze)')
  .option('--subagent-runs-dir <path>', 'Directory containing session-generated subagent run artifacts')
  .option(
    '--report-dir <path>',
    'Output directory for benchmark-report.json and benchmark-summary.md',
    '.gitnexus/benchmark-agent-safe-query-context',
  )
  .option('--extensions <list>', 'Analyze extension filter (comma-separated, optional)')
  .option('--skip-analyze', 'Skip analyze stage and evaluate current index only')
  .action(createLazyAction(() => import('./benchmark-agent-safe-query-context.js'), 'benchmarkAgentSafeQueryContextCommand'));

program
  .command('benchmark-u2-e2e')
  .description('Run fail-fast full neonspark U2 E2E benchmark and emit evidence reports')
  .option('--config <path>', 'Path to E2E config JSON')
  .option('--report-dir <path>', 'Output directory for reports')
  .action(createLazyAction(() => import('./benchmark-u2-e2e.js'), 'benchmarkU2E2ECommand'));

program
  .command('benchmark <suite>')
  .description('Run benchmark suite (currently supports: runtime-poc)')
  .option('-r, --repo <name>', 'Target indexed repo')
  .option('--report-dir <path>', 'Output directory for runtime-poc reports', 'docs/reports/runtime-poc')
  .option('--cases-path <path>', 'Optional JSON cases file for runtime-poc comparison run')
  .option('--records-path <path>', 'Optional JSON records file to emit provenance artifact only')
  .action(createLazyAction(() => import('./benchmark.js'), 'benchmarkSuiteCommand'));

program.parse(process.argv);
