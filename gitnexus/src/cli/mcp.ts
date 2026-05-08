/**
 * MCP Command
 *
 * Starts the MCP server in standalone mode.
 * Loads all indexed repos from the global registry.
 * No longer depends on cwd — works from any directory.
 *
 * IMPORTANT: this module's static-import closure is intentionally tiny
 * (one chain: `mcp/stdio-context.js` → `mcp/stdio-capture.js`, which is a
 * leaf with zero non-`node:` imports). All heavy backend modules
 * (`startMCPServer`, `LocalBackend`, `warnMissingOptionalGrammars`) load
 * via `await import(...)` AFTER `installGlobalStdoutSentinel()` runs.
 *
 * This closes the ESM-evaluation-order window where native init banners
 * from `@ladybugdb/core` (or any future heavy import) could reach raw
 * stdout before the sentinel exists. Codex's adversarial review on
 * PR #1383 found that even with the sentinel-install call as the first
 * statement of `mcpCommand`, ESM evaluates static imports of THIS module
 * before the function body runs — so any native side effects during
 * those imports happen before the sentinel can intercept them.
 *
 * If you find yourself adding a static `import` to this file, ask
 * whether the imported module (or anything it transitively imports)
 * touches `process.stdout` or loads a native binding at module init. If
 * either is true, switch it to a dynamic `await import(...)` inside
 * `mcpCommand` after the sentinel install. The regression test at
 * `gitnexus/test/integration/mcp/import-closure.test.ts` enforces this.
 */

import { installGlobalStdoutSentinel } from '../mcp/stdio-context.js';

export const mcpCommand = async () => {

  // Prevent unhandled errors from crashing the MCP server process.
  // LadybugDB lock conflicts and transient errors should degrade gracefully.
  process.on('uncaughtException', (err) => {
    console.error(`GitNexus MCP: uncaught exception — ${err.message}`);
    // Process is in an undefined state after uncaughtException — exit after flushing
    setTimeout(() => process.exit(1), 100);
  });
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    console.error(`GitNexus MCP: unhandled rejection — ${msg}`);
  });

  // Initialize multi-repo backend from registry.
  // The server starts even with 0 repos — tools call refreshRepos() lazily,
  // so repos indexed after the server starts are discovered automatically.
  const backend = new LocalBackend();
  await backend.init();

  const repos = await backend.listRepos();
  if (repos.length === 0) {
    // Operator-actionable but the server still starts and serves; warn-level,
    // not error. Tools will discover newly-analyzed repos via lazy refresh.
    logger.warn(
      'GitNexus: No indexed repos yet. Run `gitnexus analyze` in a git repo — the server will pick it up automatically.',
    );
  } else {
    logger.info(
      { repoCount: repos.length, repos: repos.map((r) => r.name) },
      'GitNexus: MCP server starting',
    );
  }

  // Start MCP server (serves all repos, discovers new ones lazily)
  await startMCPServer(backend);
};
