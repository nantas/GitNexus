/**
 * Analyze Command
 *
 * Indexes a repository and stores the knowledge graph in .gitnexus/
 *
 * Delegates core analysis to the shared runFullAnalysis orchestrator.
 * This CLI wrapper handles: heap management, progress bar, SIGINT,
 * skill generation (--skills), summary output, and process.exit().
 */

import path from 'path';
import { execFileSync } from 'child_process';
import v8 from 'v8';
import cliProgress from 'cli-progress';
import { runPipelineFromRepo } from '../core/ingestion/pipeline.js';
import { initLbug, loadGraphToLbug, getLbugStats, executeQuery, executeWithReusedStatement, closeLbug, createFTSIndex, loadCachedEmbeddings } from '../core/lbug/lbug-adapter.js';
// Embedding imports are lazy (dynamic import) so onnxruntime-node is never
// loaded when embeddings are not requested. This avoids crashes on Node
// versions whose ABI is not yet supported by the native binary (#89).
// disposeEmbedder intentionally not called — ONNX Runtime segfaults on cleanup (see #38)
import { getStoragePaths, saveMeta, loadMeta, addToGitignore, registerRepo, getGlobalRegistryPath, loadCLIConfig, cleanupOldKuzuFiles, type RepoMeta } from '../storage/repo-manager.js';
import { getCurrentCommit, isGitRepo, getGitRoot } from '../storage/git.js';
import { generateAIContextFiles } from './ai-context.js';
import { generateSkillFiles, type GeneratedSkillInfo } from './skill-gen.js';
import fs from 'fs/promises';
import { resolveEffectiveAnalyzeOptions, validateStoredOptions } from './analyze-options.js';
import {
  formatCSharpPreprocDiagnosticsSummary,
  formatFallbackSummary,
  formatUnityDiagnosticsSummary,
  formatUnityRuleBindingSummary,
  resolveFallbackStats,
} from './analyze-summary.js';
import { resolveChildProcessExit } from './exit-code.js';
import { toPipelineRuntimeSummary } from './analyze-runtime-summary.js';
import type { PipelineResult } from '../types/pipeline.js';
import type { UnityParitySeed } from '../core/ingestion/unity-parity-seed.js';

const HEAP_MB = 8192;
const HEAP_FLAG = `--max-old-space-size=${HEAP_MB}`;
/** Increase default stack size (KB) to prevent stack overflow on deep class hierarchies. */
const STACK_KB = 4096;
const STACK_FLAG = `--stack-size=${STACK_KB}`;

/** Re-exec the process with an 8GB heap and larger stack if we're currently below that. */
function ensureHeap(): boolean {
  const nodeOpts = process.env.NODE_OPTIONS || '';
  if (nodeOpts.includes('--max-old-space-size')) return false;

  const v8Heap = v8.getHeapStatistics().heap_size_limit;
  if (v8Heap >= HEAP_MB * 1024 * 1024 * 0.9) return false;

  // --stack-size is a V8 flag not allowed in NODE_OPTIONS on Node 24+,
  // so pass it only as a direct CLI argument, not via the environment.
  const cliFlags = [HEAP_FLAG];
  if (!nodeOpts.includes('--stack-size')) cliFlags.push(STACK_FLAG);

  try {
    execFileSync(process.execPath, [...cliFlags, ...process.argv.slice(1)], {
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: `${nodeOpts} ${HEAP_FLAG}`.trim() },
    });
  } catch (e: any) {
    const resolved = resolveChildProcessExit(e, 1);
    if (resolved.bySignal && resolved.signal) {
      console.error(`  analyze subprocess terminated by signal ${resolved.signal}`);
    }
    process.exitCode = resolved.code;
  }
  return true;
}

export interface AnalyzeOptions {
  force?: boolean;
  embeddings?: boolean;
  extensions?: string;
  repoAlias?: string;
  csharpDefineCsproj?: string;
  reuseOptions?: boolean;
  skills?: boolean;
  verbose?: boolean;
  /** Skip AGENTS.md and CLAUDE.md gitnexus block updates. */
  skipAgentsMd?: boolean;
  /** Omit volatile symbol/relationship counts from AGENTS.md and CLAUDE.md. */
  noStats?: boolean;
  /** Index the folder even when no .git directory is present. */
  skipGit?: boolean;
  /**
   * Override the default basename-derived registry `name` with a
   * user-supplied alias (#829). Disambiguates repos whose paths share a
   * basename. Persisted — subsequent re-analyses of the same path without
   * `--name` preserve the alias.
   */
  name?: string;
  /**
   * Allow registration even when another path already uses the same
   * `--name` alias (#829). Intentionally a distinct flag from `--force`
   * because the user may want to coexist under the same name WITHOUT
   * paying the cost of a pipeline re-index. Maps to registerRepo's
   * `allowDuplicateName` option end-to-end.
   */
  allowDuplicateName?: boolean;
  /**
   * Override the walker's large-file skip threshold (#991). Value in KB;
   * clamped downstream to the tree-sitter 32 MB ceiling. Sets
   * `GITNEXUS_MAX_FILE_SIZE` for the rest of the pipeline.
   */
  maxFileSize?: string;
  /** Override worker sub-batch idle timeout in seconds. */
  workerTimeout?: string;
  embeddingThreads?: string;
  embeddingBatchSize?: string;
  embeddingSubBatchSize?: string;
  embeddingDevice?: string;
}

export const analyzeCommand = async (inputPath?: string, options?: AnalyzeOptions) => {
  if (ensureHeap()) return;

  // Install fatal handlers immediately after re-exec resolution so any
  // async error that escapes the try/catch below (#1169) surfaces with
  // a stack trace and a non-zero exit code instead of a silent exit 0.
  installFatalHandlers();

  if (options?.verbose) {
    process.env.GITNEXUS_VERBOSE = '1';
  }

  if (options?.maxFileSize) {
    process.env.GITNEXUS_MAX_FILE_SIZE = options.maxFileSize;
  }

  if (options?.workerTimeout) {
    const workerTimeoutSeconds = Number(options.workerTimeout);
    if (!Number.isFinite(workerTimeoutSeconds) || workerTimeoutSeconds < 1) {
      cliError('  --worker-timeout must be at least 1 second.\n');
      process.exitCode = 1;
      return;
    }
    process.env.GITNEXUS_WORKER_SUB_BATCH_TIMEOUT_MS = String(
      Math.round(workerTimeoutSeconds * 1000),
    );
  }

  // Parse `--embeddings [limit]`: `true` → default cap, string → numeric cap
  // (0 disables the cap entirely). Validated up here so failures match the
  // sibling-validation pattern (exit before bar.start() — otherwise
  // process.exit() leaves the progress bar's hidden cursor uncleared).
  let embeddingsNodeLimit: number | undefined;
  if (typeof options?.embeddings === 'string') {
    const parsed = Number(options.embeddings);
    if (!Number.isInteger(parsed) || parsed < 0) {
      cliError(
        `  --embeddings expects a non-negative integer (got "${options.embeddings}"). ` +
          `Pass 0 to disable the safety cap, or omit the value to keep the default.\n`,
      );
      process.exitCode = 1;
      return;
    }
    embeddingsNodeLimit = parsed;
  }
  const embeddingsEnabled = !!options?.embeddings;

  const setPositiveEnv = (
    optionName: string,
    envName: string,
    value: string | undefined,
  ): boolean => {
    if (value === undefined) return true;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      cliError(`  ${optionName} must be a positive integer.\n`);
      process.exitCode = 1;
      return false;
    }
    process.env[envName] = String(parsed);
    return true;
  };

  if (
    !setPositiveEnv(
      '--embedding-threads',
      'GITNEXUS_EMBEDDING_THREADS',
      options?.embeddingThreads,
    ) ||
    !setPositiveEnv(
      '--embedding-batch-size',
      'GITNEXUS_EMBEDDING_BATCH_SIZE',
      options?.embeddingBatchSize,
    ) ||
    !setPositiveEnv(
      '--embedding-sub-batch-size',
      'GITNEXUS_EMBEDDING_SUB_BATCH_SIZE',
      options?.embeddingSubBatchSize,
    )
  ) {
    return;
  }

  if (options?.embeddingDevice) {
    const allowed = new Set(['auto', 'cpu', 'dml', 'cuda', 'wasm']);
    if (!allowed.has(options.embeddingDevice)) {
      cliError('  --embedding-device must be one of: auto, cpu, dml, cuda, wasm.\n');
      process.exitCode = 1;
      return;
    }
    process.env.GITNEXUS_EMBEDDING_DEVICE = options.embeddingDevice;
  }

  console.log('\n  GitNexus Analyzer\n');

  let repoPath: string;
  if (inputPath) {
    repoPath = path.resolve(inputPath);
  } else if (options?.skipGit) {
    // --skip-git: treat cwd as the index root, do not walk up to a parent git repo.
    repoPath = path.resolve(process.cwd());
  } else {
    const gitRoot = getGitRoot(process.cwd());
    if (!gitRoot) {
      console.log(
        '  Not inside a git repository.\n  Tip: pass --skip-git to index any folder without a .git directory.\n',
      );
      process.exitCode = 1;
      return;
    }
    repoPath = gitRoot;
  }

  const repoHasGit = hasGitDir(repoPath);
  if (!repoHasGit && !options?.skipGit) {
    console.log(
      '  Not a git repository.\n  Tip: pass --skip-git to index any folder without a .git directory.\n',
    );
    process.exitCode = 1;
    return;
  }
  if (!repoHasGit) {
    console.log(
      '  Warning: no .git directory found \u2014 commit-tracking and incremental updates disabled.\n',
    );
  }

  const currentCommit = getCurrentCommit(repoPath);
  const existingMeta = await loadMeta(storagePath);
  let hasLbugIndex = false;
  try {
    await fs.stat(lbugPath);
    hasLbugIndex = true;
  } catch {
    hasLbugIndex = false;
  }

  let includeExtensions: string[] = [];
  let scopeRules: string[] = [];
  let repoAlias: string | undefined;
  let embeddingsEnabled = false;
  let effectiveCsharpDefineCsproj: string | undefined;
  try {
    const validatedStored = await validateStoredOptions(
      existingMeta?.analyzeOptions,
      repoPath,
    );

    const effectiveOptions = await resolveEffectiveAnalyzeOptions({
      extensions: options?.extensions,
      repoAlias: options?.repoAlias,
      embeddings: options?.embeddings,
      reuseOptions: options?.reuseOptions,
      csharpDefineCsproj: options?.csharpDefineCsproj,
    }, validatedStored);
    includeExtensions = effectiveOptions.includeExtensions;
    scopeRules = effectiveOptions.scopeRules;
    repoAlias = effectiveOptions.repoAlias;
    embeddingsEnabled = effectiveOptions.embeddings;
    effectiveCsharpDefineCsproj = effectiveOptions.csharpDefineCsproj;
  } catch (error: any) {
    console.log(`  ${error?.message || String(error)}\n`);
    process.exitCode = 1;
    return;
  }

  if (existingMeta && !hasLbugIndex && !options?.force) {
    console.log('  Existing metadata found, but LadybugDB index file is missing — rebuilding index...\n');
  }

  if (existingMeta && hasLbugIndex && !options?.force && existingMeta.lastCommit === currentCommit && !options?.skills) {
    const hasCliOverrides =
      options?.extensions !== undefined ||
      options?.repoAlias !== undefined ||
      options?.embeddings !== undefined ||
      options?.csharpDefineCsproj !== undefined ||
      options?.reuseOptions === false;

    if (!hasCliOverrides) {
      console.log('  Already up to date\n');
      return;
    }

    if (
      options?.reuseOptions !== false &&
      includeExtensions.length === 0 &&
      scopeRules.length === 0 &&
      !repoAlias &&
      !embeddingsEnabled
    ) {
      console.log('  Already up to date\n');
      return;
    }
  }

  if (process.env.GITNEXUS_NO_GITIGNORE) {
    console.log(
      '  GITNEXUS_NO_GITIGNORE is set — skipping .gitignore (still reading .gitnexusignore)\n',
    );
  }

  const maxFileSizeBanner = getMaxFileSizeBannerMessage();
  if (maxFileSizeBanner) {
    console.log(`${maxFileSizeBanner}\n`);
  }

  // ── CLI progress bar setup ─────────────────────────────────────────
  const bar = new cliProgress.SingleBar(
    {
      format: '  {bar} {percentage}% | {phase}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      barGlue: '',
      autopadding: true,
      clearOnComplete: false,
      stopOnComplete: false,
    },
    cliProgress.Presets.shades_grey,
  );

  bar.start(100, 0, { phase: 'Initializing...' });

  // Graceful SIGINT handling. Pino's default destination is `sync: false`
  // (buffered) — flush before exit so in-flight records reach stderr.
  // See `gitnexus/src/core/logger.ts:flushLoggerSync`.
  let aborted = false;
  const sigintHandler = () => {
    if (aborted) process.exit(1);
    aborted = true;
    bar.stop();
    console.log('\n  Interrupted — cleaning up...');
    closeLbug()
      .catch(() => {})
      .finally(async () => {
        const { flushLoggerSync } = await import('../core/logger.js');
        flushLoggerSync();
        process.exit(130);
      });
  };
  process.on('SIGINT', sigintHandler);

  // Route console output through bar.log() to prevent progress bar corruption.
  // This is a deliberate UI pattern (not a logging concern): analyze runs a
  // long-lived progress bar on stdout; any concurrent console.* write would
  // overwrite the bar mid-render. We capture originals, swap to barLog for
  // the lifetime of the run, and restore on completion/error/SIGINT.
  const origLog = console.log.bind(console);
  // eslint-disable-next-line no-console -- intentional console-routing for progress bar UX
  const origWarn = console.warn.bind(console);
  // eslint-disable-next-line no-console -- intentional console-routing for progress bar UX
  const origError = console.error.bind(console);
  let barCurrentValue = 0;
  const barLog = (...args: any[]) => {
    process.stdout.write('\x1b[2K\r');
    origLog(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '));
    bar.update(barCurrentValue);
  };
  console.log = barLog;
  // eslint-disable-next-line no-console -- intentional console-routing for progress bar UX
  console.warn = barLog;
  // eslint-disable-next-line no-console -- intentional console-routing for progress bar UX
  console.error = barLog;

  // Track elapsed time per phase
  let lastPhaseLabel = 'Initializing...';
  let phaseStart = Date.now();

  const updateBar = (value: number, phaseLabel: string) => {
    barCurrentValue = value;
    if (phaseLabel !== lastPhaseLabel) {
      lastPhaseLabel = phaseLabel;
      phaseStart = Date.now();
    }
    const elapsed = Math.round((Date.now() - phaseStart) / 1000);
    const display = elapsed >= 3 ? `${phaseLabel} (${elapsed}s)` : phaseLabel;
    bar.update(value, { phase: display });
  };

  const elapsedTimer = setInterval(() => {
    const elapsed = Math.round((Date.now() - phaseStart) / 1000);
    if (elapsed >= 3) {
      bar.update({ phase: `${lastPhaseLabel} (${elapsed}s)` });
    }
  }, 1000);

  const t0 = Date.now();

  // ── Cache embeddings from existing index before rebuild ────────────
  let cachedEmbeddingNodeIds = new Set<string>();
  let cachedEmbeddings: Array<{ nodeId: string; embedding: number[] }> = [];

  if (embeddingsEnabled && existingMeta && !options?.force) {
    try {
      updateBar(0, 'Caching embeddings...');
      await initLbug(lbugPath);
      const cached = await loadCachedEmbeddings();
      cachedEmbeddingNodeIds = cached.embeddingNodeIds;
      cachedEmbeddings = cached.embeddings;
      await closeLbug();
    } catch {
      try { await closeLbug(); } catch {}
    }
  }

  // ── Phase 1: Full Pipeline (0–60%) ─────────────────────────────────
  let pipelineResult: PipelineResult | undefined;
  try {
    const pipelineRunOptions = buildPipelineRunOptionsForAnalyze(
      { includeExtensions, scopeRules },
      { csharpDefineCsproj: effectiveCsharpDefineCsproj },
    );

    pipelineResult = await runPipelineFromRepo(
      repoPath,
      (progress) => {
        const phaseLabel = PHASE_LABELS[progress.phase] || progress.phase;
        const scaled = Math.round(progress.percent * 0.6);
        updateBar(scaled, phaseLabel);
      },
      pipelineRunOptions,
    );
  } catch (error: any) {
    clearInterval(elapsedTimer);
    process.removeListener('SIGINT', sigintHandler);
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
    bar.stop();
    console.log(`\n  ${error?.message || String(error)}\n`);
    process.exitCode = 1;
    return;
  }

  // ── Phase 2: LadybugDB (60–85%) ──────────────────────────────────────
  updateBar(60, 'Loading into LadybugDB...');

  await closeLbug();
  const lbugFiles = [lbugPath, `${lbugPath}.wal`, `${lbugPath}.lock`];
  for (const f of lbugFiles) {
    try { await fs.rm(f, { recursive: true, force: true }); } catch {}
  }

  const t0Lbug = Date.now();
  await initLbug(lbugPath);
  let lbugMsgCount = 0;
  const lbugResult = await loadGraphToLbug(pipelineResult.graph, pipelineResult.repoPath, storagePath, (msg) => {
    lbugMsgCount++;
    const progress = Math.min(84, 60 + Math.round((lbugMsgCount / (lbugMsgCount + 10)) * 24));
    updateBar(progress, msg);
  });
  const pipelineForSkills = pipelineResult;
  const pipelineRuntime = toPipelineRuntimeSummary(pipelineResult);
  pipelineResult = undefined;
  const lbugTime = ((Date.now() - t0Lbug) / 1000).toFixed(1);
  const lbugWarnings = lbugResult.warnings;

  // ── Phase 3: FTS (85–90%) ─────────────────────────────────────────
  updateBar(85, 'Creating search indexes...');

  const t0Fts = Date.now();
  try {
    await createFTSIndex('File', 'file_fts', ['name', 'content']);
    await createFTSIndex('Function', 'function_fts', ['name', 'content']);
    await createFTSIndex('Class', 'class_fts', ['name', 'content']);
    await createFTSIndex('Method', 'method_fts', ['name', 'content']);
    await createFTSIndex('Interface', 'interface_fts', ['name', 'content']);
  } catch (e: any) {
    // Non-fatal — FTS is best-effort
  }
  const ftsTime = ((Date.now() - t0Fts) / 1000).toFixed(1);

  // ── Phase 3.5: Re-insert cached embeddings ────────────────────────
  if (cachedEmbeddings.length > 0) {
    updateBar(88, `Restoring ${cachedEmbeddings.length} cached embeddings...`);
    const EMBED_BATCH = 200;
    for (let i = 0; i < cachedEmbeddings.length; i += EMBED_BATCH) {
      const batch = cachedEmbeddings.slice(i, i + EMBED_BATCH);
      const paramsList = batch.map(e => ({ nodeId: e.nodeId, embedding: e.embedding }));
      try {
        await executeWithReusedStatement(
          `CREATE (e:CodeEmbedding {nodeId: $nodeId, embedding: $embedding})`,
          paramsList,
        );
      } catch { /* some may fail if node was removed, that's fine */ }
    }
  }

  // ── Phase 4: Embeddings (90–98%) ──────────────────────────────────
  const stats = await getLbugStats();
  let embeddingTime = '0.0';
  let embeddingSkipped = true;
  let embeddingSkipReason = 'off (use --embeddings to enable)';

  if (embeddingsEnabled) {
    if (stats.nodes > EMBEDDING_NODE_LIMIT) {
      embeddingSkipReason = `skipped (${stats.nodes.toLocaleString()} nodes > ${EMBEDDING_NODE_LIMIT.toLocaleString()} limit)`;
    } else {
      embeddingSkipped = false;
    }
  }

  if (!embeddingSkipped) {
    updateBar(90, 'Loading embedding model...');
    const t0Emb = Date.now();
    const { runEmbeddingPipeline } = await import('../core/embeddings/embedding-pipeline.js');
    await runEmbeddingPipeline(
      executeQuery,
      executeWithReusedStatement,
      (progress) => {
        const scaled = 90 + Math.round((progress.percent / 100) * 8);
        const label = progress.phase === 'loading-model' ? 'Loading embedding model...' : `Embedding ${progress.nodesProcessed || 0}/${progress.totalNodes || '?'}`;
        updateBar(scaled, label);
      },
    );

  // ── Phase 5: Finalize (98–100%) ───────────────────────────────────
  updateBar(98, 'Saving metadata...');

  // Count embeddings in the index (cached + newly generated)
  let embeddingCount = 0;
  try {
    const embResult = await executeQuery(`MATCH (e:CodeEmbedding) RETURN count(e) AS cnt`);
    embeddingCount = embResult?.[0]?.cnt ?? 0;
  } catch { /* table may not exist if embeddings never ran */ }

  const meta: RepoMeta = {
    repoPath,
    lastCommit: currentCommit,
    indexedAt: new Date().toISOString(),
    analyzeOptions: {
      includeExtensions,
      scopeRules,
      repoAlias,
      embeddings: embeddingsEnabled,
      csharpDefineCsproj: effectiveCsharpDefineCsproj,
    },
    stats: {
      files: pipelineRuntime.totalFileCount,
      nodes: stats.nodes,
      edges: stats.edges,
      communities: pipelineRuntime.communityResult?.stats.totalCommunities,
      processes: pipelineRuntime.processResult?.stats.totalProcesses,
      embeddings: embeddingCount,
    },
  };
  const registeredRepo = await registerRepo(repoPath, meta, { repoAlias });
  meta.repoId = registeredRepo.name;
  await saveMeta(storagePath, meta);
  await persistUnityParitySeed(storagePath, pipelineRuntime.unityResult?.paritySeed);
  await addToGitignore(repoPath);

  const projectName = path.basename(repoPath);
  let aggregatedClusterCount = 0;
  if (pipelineRuntime.communityResult?.communities) {
    const groups = new Map<string, number>();
    for (const c of pipelineRuntime.communityResult.communities) {
      const label = c.heuristicLabel || c.label || 'Unknown';
      groups.set(label, (groups.get(label) || 0) + c.symbolCount);
    }

    // Post-finalize invariant (#1169): runFullAnalysis nominally writes
    // meta.json and registers the repo, but on Windows it has been
    // observed to return successfully with neither artifact present
    // (banner-only output, exit 0). Verify both before declaring
    // success so the silent-finalize state surfaces with a non-zero
    // exit code and an actionable error instead of being mistaken for
    // a healthy index.
    await assertAnalysisFinalized(repoPath);

    // Skill generation (CLI-only, uses pipeline result from analysis)
    if (options?.skills && result.pipelineResult) {
      updateBar(99, 'Generating skill files...');
      try {
        const { generateSkillFiles } = await import('./skill-gen.js');
        const { generateAIContextFiles } = await import('./ai-context.js');
        const skillResult = await generateSkillFiles(
          repoPath,
          result.repoName,
          result.pipelineResult,
        );
        if (skillResult.skills.length > 0) {
          barLog(`  Generated ${skillResult.skills.length} skill files`);
          // Re-generate AI context files now that we have skill info
          const s = result.stats;
          const communityResult = result.pipelineResult?.communityResult;
          let aggregatedClusterCount = 0;
          if (communityResult?.communities) {
            const groups = new Map<string, number>();
            for (const c of communityResult.communities) {
              const label = c.heuristicLabel || c.label || 'Unknown';
              groups.set(label, (groups.get(label) || 0) + c.symbolCount);
            }
            aggregatedClusterCount = Array.from(groups.values()).filter(
              (count: number) => count >= 5,
            ).length;
          }
          const { storagePath: sp } = getStoragePaths(repoPath);
          await generateAIContextFiles(
            repoPath,
            sp,
            result.repoName,
            {
              files: s.files ?? 0,
              nodes: s.nodes ?? 0,
              edges: s.edges ?? 0,
              communities: s.communities,
              clusters: aggregatedClusterCount,
              processes: s.processes,
            },
            skillResult.skills,
            { skipAgentsMd: options?.skipAgentsMd, noStats: options?.noStats },
          );
        }
      } catch {
        /* best-effort */
      }
    }

    const totalTime = ((Date.now() - t0) / 1000).toFixed(1);

    clearInterval(elapsedTimer);
    process.removeListener('SIGINT', sigintHandler);

    console.log = origLog;
    // eslint-disable-next-line no-console -- restoring after intentional progress-bar routing
    console.warn = origWarn;
    // eslint-disable-next-line no-console -- restoring after intentional progress-bar routing
    console.error = origError;

    bar.update(100, { phase: 'Done' });
    bar.stop();

    // ── Summary ────────────────────────────────────────────────────
    const s = result.stats;
    console.log(`\n  Repository indexed successfully (${totalTime}s)\n`);
    console.log(
      `  ${(s.nodes ?? 0).toLocaleString()} nodes | ${(s.edges ?? 0).toLocaleString()} edges | ${s.communities ?? 0} clusters | ${s.processes ?? 0} flows`,
    );
    console.log(`  ${repoPath}`);

    try {
      await fs.access(getGlobalRegistryPath());
    } catch {
      console.log('\n  Tip: Run `gitnexus setup` to configure MCP for your editor.');
    }

    console.log('');
  } catch (err: any) {
    clearInterval(elapsedTimer);
    process.removeListener('SIGINT', sigintHandler);
    console.log = origLog;
    // eslint-disable-next-line no-console -- restoring after intentional progress-bar routing
    console.warn = origWarn;
    // eslint-disable-next-line no-console -- restoring after intentional progress-bar routing
    console.error = origError;
    bar.stop();

    const msg = err.message || String(err);

    // Registry name-collision from --name (#829) — surface as an
    // actionable error rather than a generic stack-trace.
    if (err instanceof RegistryNameCollisionError) {
      cliError(
        `\n  Registry name collision:\n` +
          `    "${err.registryName}" is already used by "${err.existingPath}".\n\n` +
          `  Options:\n` +
          `    • Pick a different alias:  gitnexus analyze --name <alias>\n` +
          `    • Allow the duplicate:     gitnexus analyze --allow-duplicate-name  (leaves "-r ${err.registryName}" ambiguous)\n`,
        { registryName: err.registryName, existingPath: err.existingPath },
      );
      process.exitCode = 1;
      return;
    }

    // Finalize invariant failure (#1169) — keep the rich actionable
    // message intact and write through realStderrWrite so it can't be
    // erased by a leftover bar refresh on slow terminals.
    if (err instanceof AnalysisNotFinalizedError) {
      writeFatalToStderr('Analysis did not finalize', err);
      realStderrWrite(
        `\n  Diagnostic checklist:\n` +
          `    1. Re-run "gitnexus analyze" - transient native errors often clear on retry.\n` +
          `    2. Inspect ${err.storagePath} - a leftover lbug.wal indicates an aborted write.\n` +
          `    3. If the failure persists, run with NODE_OPTIONS="--max-old-space-size=8192 --trace-exit"\n` +
          `       and attach the trace to the GitNexus issue tracker.\n\n`,
      );
      process.exitCode = 1;
      return;
    }

    // HF download failure — show clean guidance without the raw stack trace.
    // Checked before writeFatalToStderr so the user sees one focused message
    // rather than a stack-trace dump followed by a second remediation block.
    if (isHfDownloadFailure(msg) || msg.includes('Failed to download embedding model')) {
      cliError(
        `  The embedding model could not be downloaded.\n` +
          `  huggingface.co may be unreachable from your network\n` +
          `  (e.g. behind a corporate proxy or a regional firewall).\n` +
          `  Suggestions:\n` +
          `    1. Set HF_ENDPOINT to a mirror and retry:\n` +
          `         HF_ENDPOINT=https://hf-mirror.com npx gitnexus analyze --embeddings\n` +
          `         (Windows: set HF_ENDPOINT=https://hf-mirror.com && npx gitnexus analyze --embeddings)\n` +
          `    2. Check your proxy / VPN settings.\n` +
          `    3. Once downloaded the model is cached — future runs work offline.\n`,
        { recoveryHint: 'hf-endpoint-unreachable' },
      );
      process.exitCode = 1;
      return;
    }

    // Bypass the redirected console.error and write the full stack to
    // the real stderr captured at module load. The redirected
    // console.error wraps every line with `\\x1b[2K\\r` (ANSI clear-line)
    // and forces a bar.update() afterwards, which on some Windows
    // terminals visually erases the failure message — the canonical
    // shape of the silent-exit symptom in #1169.
    writeFatalToStderr('Analysis failed', err);

    // Provide helpful guidance for known failure modes
    if (
      msg.includes('Maximum call stack size exceeded') ||
      msg.includes('call stack') ||
      msg.includes('Map maximum size') ||
      msg.includes('Invalid array length') ||
      msg.includes('Invalid string length') ||
      msg.includes('allocation failed') ||
      msg.includes('heap out of memory') ||
      msg.includes('JavaScript heap')
    ) {
      cliError(
        `  This error typically occurs on very large repositories.\n` +
          `  Suggestions:\n` +
          `    1. Add large vendored/generated directories to .gitnexusignore\n` +
          `    2. Increase Node.js heap: NODE_OPTIONS="--max-old-space-size=16384"\n` +
          `    3. Increase stack size: NODE_OPTIONS="--stack-size=4096"\n`,
        { recoveryHint: 'large-repo' },
      );
    } else if (msg.includes('ERESOLVE') || msg.includes('Could not resolve dependency')) {
      // Note: the original arborist "Cannot destructure property 'package' of
      // 'node.target'" crash happens inside npm *before* gitnexus code runs,
      // so it can't be caught here.  This branch handles dependency-resolution
      // errors that surface at runtime (e.g. dynamic require failures).
      cliError(
        `  This looks like an npm dependency resolution issue.\n` +
          `  Suggestions:\n` +
          `    1. Clear the npm cache:    npm cache clean --force\n` +
          `    2. Update npm:             npm install -g npm@latest\n` +
          `    3. Reinstall gitnexus:     npm install -g gitnexus@latest\n` +
          `    4. Or try npx directly:    npx gitnexus@latest analyze\n`,
        { recoveryHint: 'npm-resolution' },
      );
    } else if (
      msg.includes('MODULE_NOT_FOUND') ||
      msg.includes('Cannot find module') ||
      msg.includes('ERR_MODULE_NOT_FOUND')
    ) {
      cliError(
        `  A required module could not be loaded. The installation may be corrupt.\n` +
          `  Suggestions:\n` +
          `    1. Reinstall:   npm install -g gitnexus@latest\n` +
          `    2. Clear cache: npm cache clean --force && npx gitnexus@latest analyze\n`,
        { recoveryHint: 'module-not-found' },
      );
    }

    process.exitCode = 1;
    return;
  }

  let generatedSkills: GeneratedSkillInfo[] = [];
  if (options?.skills && pipelineForSkills.communityResult) {
    updateBar(99, 'Generating skill files...');
    const skillResult = await generateSkillFiles(repoPath, projectName, pipelineForSkills);
    generatedSkills = skillResult.skills;
  }

  const cliConfig = await loadCLIConfig();
  const aiContext = await generateAIContextFiles(repoPath, storagePath, projectName, {
    files: pipelineRuntime.totalFileCount,
    nodes: stats.nodes,
    edges: stats.edges,
    communities: pipelineRuntime.communityResult?.stats.totalCommunities,
    clusters: aggregatedClusterCount,
    processes: pipelineRuntime.processResult?.stats.totalProcesses,
  }, {
    skillScope: (cliConfig.setupScope === 'global') ? 'global' : 'project',
  }, generatedSkills);

  await closeLbug();
  // Note: we intentionally do NOT call disposeEmbedder() here.
  // ONNX Runtime's native cleanup segfaults on macOS and some Linux configs.
  // Since the process exits immediately after, Node.js reclaims everything.

  const totalTime = ((Date.now() - t0Global) / 1000).toFixed(1);

  clearInterval(elapsedTimer);
  process.removeListener('SIGINT', sigintHandler);

  console.log = origLog;
  console.warn = origWarn;
  console.error = origError;

  bar.update(100, { phase: 'Done' });
  bar.stop();

  // ── Summary ───────────────────────────────────────────────────────
  const embeddingsCached = cachedEmbeddings.length > 0;
  console.log(`\n  Repository indexed successfully (${totalTime}s)${embeddingsCached ? ` [${cachedEmbeddings.length} embeddings cached]` : ''}\n`);
  console.log(`  Repo Name: ${registeredRepo.name}`);
  console.log(`  Repo Alias: ${registeredRepo.alias || 'none'}`);
  console.log(`  Scope Rules: ${scopeRules.length}`);
  console.log(`  Scoped Files: ${pipelineRuntime.totalFileCount}`);
  if (scopeRules.length > 0 && pipelineRuntime.scopeDiagnostics) {
    const diagnostics = pipelineRuntime.scopeDiagnostics;
    console.log(`  Scope Overlap Files: ${diagnostics.overlapFiles} (${diagnostics.dedupedMatchCount} duplicate matches removed)`);
    if (diagnostics.normalizedCollisions.length === 0) {
      console.log('  Scope Collisions: none');
    } else {
      console.warn(`  Scope Collisions: ${diagnostics.normalizedCollisions.length} normalized path conflict(s) detected`);
      diagnostics.normalizedCollisions.slice(0, 5).forEach((collision) => {
        console.warn(`    - ${collision.normalizedPath} <= ${collision.paths.join(' | ')}`);
      });
      if (diagnostics.normalizedCollisions.length > 5) {
        console.warn(`    ... ${diagnostics.normalizedCollisions.length - 5} more`);
      }
    }
  }
  const unitySummaryLines = formatUnityDiagnosticsSummary(pipelineRuntime.unityResult?.diagnostics);
  for (const line of unitySummaryLines) {
    console.log(`  ${line}`);
  }
  const unityRuleBindingSummaryLines = formatUnityRuleBindingSummary(pipelineRuntime.unityRuleBindingResult);
  for (const line of unityRuleBindingSummaryLines) {
    console.log(`  ${line}`);
  }
  const csharpPreprocSummaryLines = formatCSharpPreprocDiagnosticsSummary(pipelineRuntime.csharpPreprocDiagnostics);
  for (const line of csharpPreprocSummaryLines) {
    console.log(`  ${line}`);
  }
  console.log(`  ${stats.nodes.toLocaleString()} nodes | ${stats.edges.toLocaleString()} edges | ${pipelineRuntime.communityResult?.stats.totalCommunities || 0} clusters | ${pipelineRuntime.processResult?.stats.totalProcesses || 0} flows`);
  console.log(`  LadybugDB ${lbugTime}s | FTS ${ftsTime}s | Embeddings ${embeddingSkipped ? embeddingSkipReason : embeddingTime + 's'}`);
  if (includeExtensions.length > 0) {
    console.log(`  File filter: ${includeExtensions.join(', ')}`);
  }
  console.log(`  ${repoPath}`);

  if (aiContext.files.length > 0) {
    console.log(`  Context: ${aiContext.files.join(', ')}`);
  }

  if (lbugWarnings.length > 0) {
    const fallbackStats = resolveFallbackStats(lbugWarnings, lbugResult.fallbackInsertStats);
    const fallbackLines = formatFallbackSummary(
      lbugWarnings,
      fallbackStats,
    );
    for (const line of fallbackLines) {
      console.log(`  ${line}`);
    }
  }

  try {
    await fs.access(getGlobalRegistryPath());
  } catch {
    console.log('\n  Tip: Run `gitnexus setup` to configure MCP for your editor.');
  }

  console.log('');

  // LadybugDB's native module holds open handles that prevent Node from exiting.
  // ONNX Runtime also registers native atexit hooks that segfault on some
  // platforms (#38, #40). Force-exit to ensure clean termination.
  process.exit(0);
};

export function buildPipelineRunOptionsForAnalyze(
  resolvedOptions: { includeExtensions: string[]; scopeRules: string[] },
  options?: AnalyzeOptions,
): {
  includeExtensions: string[];
  scopeRules: string[];
  csharpDefineCsproj?: string;
} {
  return {
    includeExtensions: resolvedOptions.includeExtensions,
    scopeRules: resolvedOptions.scopeRules,
    ...(options?.csharpDefineCsproj
      ? { csharpDefineCsproj: options.csharpDefineCsproj }
      : {}),
  };
}

async function persistUnityParitySeed(
  storagePath: string,
  seed: UnityParitySeed | undefined,
): Promise<void> {
  const seedPath = path.join(storagePath, 'unity-parity-seed.json');
  if (!seed) {
    try {
      await fs.rm(seedPath, { force: true });
    } catch {}
    return;
  }
  await fs.writeFile(seedPath, JSON.stringify(seed), 'utf-8');
}
