/**
 * Pipeline orchestrator — dependency-ordered ingestion pipeline.
 *
 * The pipeline is composed of named phases with explicit dependencies.
 * Each phase is defined in its own file under `pipeline-phases/`.
 * The runner in `pipeline-phases/runner.ts` executes phases in
 * topological order, passing typed outputs from upstream phases as
 * inputs to downstream phases.
 *
 * To add a new phase:
 * 1. Create a new file in `pipeline-phases/` following the pattern
 * 2. Export it from `pipeline-phases/index.ts`
 * 3. Add it to the `ALL_PHASES` array below
 *
 * See ARCHITECTURE.md for the full phase dependency diagram.
 */

import { createKnowledgeGraph } from '../graph/graph.js';
import { processStructure } from './structure-processor.js';
import { processParsing, type ParsingFileInput } from './parsing-processor.js';
import {
  processImports,
  processImportsFromExtracted,
  buildImportResolutionContext
} from './import-processor.js';
import { processCalls, processCallsFromExtracted, processRoutesFromExtracted } from './call-processor.js';
import { processHeritage, processHeritageFromExtracted } from './heritage-processor.js';
import { computeMRO } from './mro-processor.js';
import { processCommunities } from './community-processor.js';
import { processProcesses } from './process-processor.js';
import { processUnityResources } from './unity-resource-processor.js';
import { applyUnityLifecycleSyntheticCalls } from './unity-lifecycle-synthetic-calls.js';
import { applyUnityRuntimeBindingRules } from './unity-runtime-binding-rules.js';
import { resolveUnityConfig } from '../config/unity-config.js';
import { loadCSharpDefineProfileFromCsproj } from '../tree-sitter/csharp-define-profile.js';
import { normalizeCSharpPreprocessorBranches } from '../tree-sitter/csharp-preproc-normalizer.js';
import { loadAnalyzeRules } from '../../mcp/local/runtime-claim-rule-registry.js';
import { createResolutionContext } from './resolution-context.js';
import { createASTCache } from './ast-cache.js';
import { PipelineProgress, PipelineResult, type PipelineRunOptions, type CSharpPreprocDiagnostics } from '../../types/pipeline.js';
import { walkRepositoryPaths, readFileContents, walkUnityResourcePaths } from './filesystem-walker.js';
import { getLanguageFromFilename } from './utils.js';
import { SupportedLanguages } from '../../config/supported-languages.js';
import { isLanguageAvailable } from '../tree-sitter/parser-loader.js';
import { createWorkerPool, WorkerPool } from './workers/worker-pool.js';
import { selectEntriesByScopeRules } from './scope-filter.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const isDev = process.env.NODE_ENV === 'development';

/** Max bytes of source content to load per parse chunk. Each chunk's source +
 *  parsed ASTs + extracted records + worker serialization overhead all live in
 *  memory simultaneously, so this must be conservative. 20MB source ≈ 200-400MB
 *  peak working memory per chunk after parse expansion. */
const CHUNK_BYTE_BUDGET = 20 * 1024 * 1024; // 20MB

/** Max AST trees to keep in LRU cache */
const AST_CACHE_CAP = 50;

export interface PipelineOptions extends PipelineRunOptions {
  /** Skip MRO, community detection, and process extraction for faster test runs. */
  skipGraphPhases?: boolean;
  /** Force sequential parsing (no worker pool). Useful for testing the sequential path. */
  skipWorkers?: boolean;
  /**
   * @internal Test-only override for worker-pool gating thresholds.
   * When unset, production defaults apply (15 files OR 512 KB total bytes).
   * Setting either field lowers the corresponding threshold so small test
   * fixtures can still exercise the worker-pool path. Do not use from
   * production call sites.
   */
  workerThresholdsForTest?: {
    minFiles?: number;
    minBytes?: number;
  };
}

// ── Phase registry ─────────────────────────────────────────────────────────

/**
 * All pipeline phases with their dependency relationships.
 *
 * Phase dependency graph:
 *
 *   scan → structure → [markdown, cobol] → parse → [routes, tools, orm]
 *     → crossFile → mro → communities → processes
 *
 * To add a new phase: create a file in pipeline-phases/, export the phase
 * object, and add it to the appropriate position in this array.
 */
function buildPhaseList(options?: PipelineOptions): PipelinePhase[] {
  const phases: PipelinePhase[] = [
    scanPhase,
    structurePhase,
    markdownPhase,
    cobolPhase,
    parsePhase,
    routesPhase,
    toolsPhase,
    ormPhase,
    crossFilePhase,
    scopeResolutionPhase,
  ];

  if (!options?.skipGraphPhases) {
    phases.push(mroPhase, communitiesPhase, processesPhase);
  }

  return phases;
}

// ── Pipeline orchestrator ─────────────────────────────────────────────────

export const runPipelineFromRepo = async (
  repoPath: string,
  onProgress: (progress: PipelineProgress) => void,
  options?: PipelineOptions,
): Promise<PipelineResult> => {
  const graph = createKnowledgeGraph();
  const pipelineStart = Date.now();

  const phases = buildPhaseList(options);

  let csharpDefineSymbols: Set<string> | undefined;
  const csharpUndefinedSymbols = new Set<string>();
  let csharpPreprocDiagnostics: CSharpPreprocDiagnostics | undefined;

  try {
    if (options?.csharpDefineCsproj) {
      const defineProfile = await loadCSharpDefineProfileFromCsproj(options.csharpDefineCsproj);
      csharpDefineSymbols = defineProfile.symbols;
      csharpPreprocDiagnostics = {
        enabled: true,
        sourcePath: defineProfile.sourcePath,
        defineSymbolCount: defineProfile.symbols.size,
        normalizedFiles: 0,
        fallbackFiles: 0,
        skippedFiles: 0,
        expressionErrors: 0,
        undefinedSymbols: [],
      };
    }

    // ── Phase 1: Scan paths only (no content read) ─────────────────────
    onProgress({
      phase: 'extracting',
      percent: 0,
      message: 'Scanning repository...',
    });

  // Extract final results for the PipelineResult contract
  const { totalFiles, usedWorkerPool } = getPhaseOutput<{
    totalFiles: number;
    usedWorkerPool: boolean;
  }>(results, 'parse');

    const scopeSelection = selectEntriesByScopeRules(scannedFiles, options?.scopeRules || []);
    const scopedFiles = scopeSelection.selected;

    if (scopeSelection.diagnostics.appliedRuleCount > 0 && scopedFiles.length === 0) {
      throw new Error('Scope filters matched zero files. Check --scope-manifest/--scope-prefix.');
    }

    const includeExtensions = new Set(
      (options?.includeExtensions || [])
        .map(ext => ext.trim().toLowerCase())
        .filter(Boolean)
        .map(ext => (ext.startsWith('.') ? ext : `.${ext}`)),
    );
    const extensionFiltered = includeExtensions.size > 0
      ? scopedFiles.filter(f => includeExtensions.has(path.extname(f.path).toLowerCase()))
      : scopedFiles;

    const totalFiles = extensionFiltered.length;

  if (!options?.skipGraphPhases) {
    communityResult = getPhaseOutput<CommunitiesOutput>(results, 'communities').communityResult;
    processResult = getPhaseOutput<ProcessesOutput>(results, 'processes').processResult;
  }

    // ── Phase 2: Structure (paths only — no content needed) ────────────
    onProgress({
      phase: 'structure',
      percent: 15,
      message: 'Analyzing project structure...',
      stats: { filesProcessed: 0, totalFiles, nodesCreated: graph.nodeCount },
    });

    const allPaths = extensionFiltered.map(f => f.path);
    const unityCandidates = await walkUnityResourcePaths(repoPath);
    const unityScopedPaths =
      (options?.scopeRules && options.scopeRules.length > 0)
        ? selectEntriesByScopeRules(
          unityCandidates.map(path => ({ path })),
          options.scopeRules,
        ).selected.map(entry => entry.path)
        : unityCandidates;
    processStructure(graph, allPaths);

    onProgress({
      phase: 'structure',
      percent: 20,
      message: 'Project structure analyzed',
      stats: { filesProcessed: totalFiles, totalFiles, nodesCreated: graph.nodeCount },
    });

    // ── Phase 3+4: Chunked read + parse ────────────────────────────────
    // Group parseable files into byte-budget chunks so only ~20MB of source
    // is in memory at a time. Each chunk is: read → parse → extract → free.

    const parseableScanned = extensionFiltered.filter(f => {
      const lang = getLanguageFromFilename(f.path);
      return lang && isLanguageAvailable(lang);
    });

    // Warn about files skipped due to unavailable parsers
    const skippedByLang = new Map<string, number>();
    for (const f of extensionFiltered) {
      const lang = getLanguageFromFilename(f.path);
      if (lang && !isLanguageAvailable(lang)) {
        skippedByLang.set(lang, (skippedByLang.get(lang) || 0) + 1);
      }
    }
    for (const [lang, count] of skippedByLang) {
      console.warn(`Skipping ${count} ${lang} file(s) — ${lang} parser not available (native binding may not have built). Try: npm rebuild tree-sitter-${lang}`);
    }
    const totalParseable = parseableScanned.length;

    if (totalParseable === 0) {
      onProgress({
        phase: 'parsing',
        percent: 82,
        message: 'No parseable files found — skipping parsing phase',
        stats: { filesProcessed: 0, totalFiles: 0, nodesCreated: graph.nodeCount },
      });
    }

    // Build byte-budget chunks
    const chunks: string[][] = [];
    let currentChunk: string[] = [];
    let currentBytes = 0;
    for (const file of parseableScanned) {
      if (currentChunk.length > 0 && currentBytes + file.size > CHUNK_BYTE_BUDGET) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentBytes = 0;
      }
      currentChunk.push(file.path);
      currentBytes += file.size;
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);

    const numChunks = chunks.length;

    if (isDev) {
      const totalMB = parseableScanned.reduce((s, f) => s + f.size, 0) / (1024 * 1024);
      console.log(`📂 Scan: ${totalFiles} paths, ${totalParseable} parseable (${totalMB.toFixed(0)}MB), ${numChunks} chunks @ ${CHUNK_BYTE_BUDGET / (1024 * 1024)}MB budget`);
    }

    onProgress({
      phase: 'parsing',
      percent: 20,
      message: `Parsing ${totalParseable} files in ${numChunks} chunk${numChunks !== 1 ? 's' : ''}...`,
      stats: { filesProcessed: 0, totalFiles: totalParseable, nodesCreated: graph.nodeCount },
    });

    // Don't spawn workers for tiny repos — overhead exceeds benefit
    const MIN_FILES_FOR_WORKERS = 15;
    const MIN_BYTES_FOR_WORKERS = 512 * 1024;
    const totalBytes = parseableScanned.reduce((s, f) => s + f.size, 0);

    // Create worker pool once, reuse across chunks
    let workerPool: WorkerPool | undefined;
    if (totalParseable >= MIN_FILES_FOR_WORKERS || totalBytes >= MIN_BYTES_FOR_WORKERS) {
      try {
        let workerUrl = new URL('./workers/parse-worker.js', import.meta.url);
        // When running under vitest, import.meta.url points to src/ where no .js exists.
        // Fall back to the compiled dist/ worker so the pool can spawn real worker threads.
        const thisDir = fileURLToPath(new URL('.', import.meta.url));
        if (!fs.existsSync(fileURLToPath(workerUrl))) {
          const distWorker = path.resolve(thisDir, '..', '..', '..', 'dist', 'core', 'ingestion', 'workers', 'parse-worker.js');
          if (fs.existsSync(distWorker)) {
            workerUrl = pathToFileURL(distWorker) as URL;
          }
        }
        workerPool = createWorkerPool(workerUrl);
      } catch (err) {
        if (isDev) console.warn('Worker pool creation failed, using sequential fallback:', (err as Error).message);
      }
    }

    let filesParsedSoFar = 0;

    // AST cache sized for one chunk (sequential fallback uses it for import/call/heritage)
    const maxChunkFiles = chunks.reduce((max, c) => Math.max(max, c.length), 0);
    astCache = createASTCache(maxChunkFiles);

    // Build import resolution context once — suffix index, file lists, resolve cache.
    // Reused across all chunks to avoid rebuilding O(files × path_depth) structures.
    const importCtx = buildImportResolutionContext(allPaths);
    const allPathObjects = allPaths.map(p => ({ path: p }));

    // Single-pass: parse + resolve imports/calls/heritage per chunk.
    // Calls/heritage use the symbol table built so far (symbols from earlier chunks
    // are already registered). This trades ~5% cross-chunk resolution accuracy for
    // 200-400MB less memory — critical for Linux-kernel-scale repos.
    const sequentialChunkFiles: ParsingFileInput[][] = [];

    try {
      for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
        const chunkPaths = chunks[chunkIdx];

        // Read content for this chunk only
        const chunkContents = await readFileContents(repoPath, chunkPaths);
        const chunkFiles: ParsingFileInput[] = chunkPaths
          .filter(p => chunkContents.has(p))
          .map((p) => {
            const originalContent = chunkContents.get(p)!;
            if (!csharpDefineSymbols || getLanguageFromFilename(p) !== SupportedLanguages.CSharp) {
              return { path: p, content: originalContent };
            }

            const normalized = normalizeCSharpPreprocessorBranches(originalContent, csharpDefineSymbols);
            csharpPreprocDiagnostics!.expressionErrors += normalized.diagnostics.expressionErrors;
            for (const symbol of normalized.diagnostics.undefinedSymbols) {
              csharpUndefinedSymbols.add(symbol);
            }

            if (!normalized.changed) {
              csharpPreprocDiagnostics!.skippedFiles += 1;
              return { path: p, content: originalContent };
            }

            csharpPreprocDiagnostics!.normalizedFiles += 1;
            return {
              path: p,
              content: normalized.normalizedText,
              rawContent: originalContent,
            };
          });

        // Parse this chunk (workers or sequential fallback)
        const chunkWorkerData = await processParsing(
          graph, chunkFiles, symbolTable, astCache,
          (current, _total, filePath) => {
            const globalCurrent = filesParsedSoFar + current;
            const parsingProgress = 20 + ((globalCurrent / totalParseable) * 62);
            onProgress({
              phase: 'parsing',
              percent: Math.round(parsingProgress),
              message: `Parsing chunk ${chunkIdx + 1}/${numChunks}...`,
              detail: filePath,
              stats: { filesProcessed: globalCurrent, totalFiles: totalParseable, nodesCreated: graph.nodeCount },
            });
          },
          workerPool,
          (count) => {
            if (csharpPreprocDiagnostics) csharpPreprocDiagnostics.fallbackFiles += count;
          },
        );

        const chunkBasePercent = 20 + ((filesParsedSoFar / totalParseable) * 62);

        if (chunkWorkerData) {
          // Imports
          await processImportsFromExtracted(graph, allPathObjects, chunkWorkerData.imports, ctx, (current, total) => {
            onProgress({
              phase: 'parsing',
              percent: Math.round(chunkBasePercent),
              message: `Resolving imports (chunk ${chunkIdx + 1}/${numChunks})...`,
              detail: `${current}/${total} files`,
              stats: { filesProcessed: filesParsedSoFar, totalFiles: totalParseable, nodesCreated: graph.nodeCount },
            });
          }, repoPath, importCtx);
          // Calls + Heritage + Routes — resolve in parallel (no shared mutable state between them)
          // This is safe because each writes disjoint relationship types into idempotent id-keyed Maps,
          // and the single-threaded event loop prevents races between synchronous addRelationship calls.
          await Promise.all([
            processCallsFromExtracted(
              graph,
              chunkWorkerData.calls,
              ctx,
              (current, total) => {
                onProgress({
                  phase: 'parsing',
                  percent: Math.round(chunkBasePercent),
                  message: `Resolving calls (chunk ${chunkIdx + 1}/${numChunks})...`,
                  detail: `${current}/${total} files`,
                  stats: { filesProcessed: filesParsedSoFar, totalFiles: totalParseable, nodesCreated: graph.nodeCount },
                });
              },
              chunkWorkerData.constructorBindings,
            ),
            processHeritageFromExtracted(
              graph,
              chunkWorkerData.heritage,
              ctx,
              (current, total) => {
                onProgress({
                  phase: 'parsing',
                  percent: Math.round(chunkBasePercent),
                  message: `Resolving heritage (chunk ${chunkIdx + 1}/${numChunks})...`,
                  detail: `${current}/${total} records`,
                  stats: { filesProcessed: filesParsedSoFar, totalFiles: totalParseable, nodesCreated: graph.nodeCount },
                });
              },
            ),
            processRoutesFromExtracted(
              graph,
              chunkWorkerData.routes ?? [],
              ctx,
              (current, total) => {
                onProgress({
                  phase: 'parsing',
                  percent: Math.round(chunkBasePercent),
                  message: `Resolving routes (chunk ${chunkIdx + 1}/${numChunks})...`,
                  detail: `${current}/${total} routes`,
                  stats: { filesProcessed: filesParsedSoFar, totalFiles: totalParseable, nodesCreated: graph.nodeCount },
                });
              },
            ),
          ]);
        } else {
          await processImports(
            graph,
            chunkFiles,
            astCache,
            ctx,
            undefined,
            repoPath,
            allPaths,
            (count) => {
              if (csharpPreprocDiagnostics) csharpPreprocDiagnostics.fallbackFiles += count;
            },
          );
          sequentialChunkFiles.push(chunkFiles);
        }

        filesParsedSoFar += chunkFiles.length;

        // Clear AST cache between chunks to free memory
        astCache.clear();
        // chunkContents + chunkFiles + chunkWorkerData go out of scope → GC reclaims
      }
    } finally {
      await workerPool?.terminate();
    }

    // Sequential fallback chunks: use the same normalized-or-raw source for call/heritage resolution
    for (const chunkFiles of sequentialChunkFiles) {
      astCache = createASTCache(chunkFiles.length);
      const rubyHeritage = await processCalls(graph, chunkFiles, astCache, ctx, undefined, (count) => {
        if (csharpPreprocDiagnostics) csharpPreprocDiagnostics.fallbackFiles += count;
      });
      await processHeritage(graph, chunkFiles, astCache, ctx, undefined, (count) => {
        if (csharpPreprocDiagnostics) csharpPreprocDiagnostics.fallbackFiles += count;
      });
      if (rubyHeritage.length > 0) {
        await processHeritageFromExtracted(graph, rubyHeritage, ctx);
      }
      astCache.clear();
    }

    // Log resolution cache stats
    if (isDev) {
      const rcStats = ctx.getStats();
      const total = rcStats.cacheHits + rcStats.cacheMisses;
      const hitRate = total > 0 ? ((rcStats.cacheHits / total) * 100).toFixed(1) : '0';
      console.log(`🔍 Resolution cache: ${rcStats.cacheHits} hits, ${rcStats.cacheMisses} misses (${hitRate}% hit rate)`);
    }

    // Free import resolution context — suffix index + resolve cache no longer needed
    // (allPathObjects and importCtx hold ~94MB+ for large repos)
    allPathObjects.length = 0;
    importCtx.resolveCache.clear();
    (importCtx as any).suffixIndex = null;
    (importCtx as any).normalizedFileList = null;

    let communityResult: Awaited<ReturnType<typeof processCommunities>> | undefined;
    let processResult: Awaited<ReturnType<typeof processProcesses>> | undefined;
    let unityResult: Awaited<ReturnType<typeof processUnityResources>> | undefined;
    let unityRuleBindingResult: ReturnType<typeof applyUnityRuntimeBindingRules> | undefined;

    if (!options?.skipGraphPhases) {
      // ── Phase 4.5: Method Resolution Order ──────────────────────────────
      onProgress({
        phase: 'parsing',
        percent: 81,
        message: 'Computing method resolution order...',
        stats: { filesProcessed: totalFiles, totalFiles, nodesCreated: graph.nodeCount },
      });

      const mroResult = computeMRO(graph);
      if (isDev && mroResult.entries.length > 0) {
        console.log(`🔀 MRO: ${mroResult.entries.length} classes analyzed, ${mroResult.ambiguityCount} ambiguities found, ${mroResult.overrideEdges} OVERRIDES edges`);
      }

      // ── Phase 5: Communities ───────────────────────────────────────────
      onProgress({
        phase: 'communities',
        percent: 82,
        message: 'Detecting code communities...',
        stats: { filesProcessed: totalFiles, totalFiles, nodesCreated: graph.nodeCount },
      });

      communityResult = await processCommunities(graph, (message, progress) => {
        const communityProgress = 82 + (progress * 0.10);
        onProgress({
          phase: 'communities',
          percent: Math.round(communityProgress),
          message,
          stats: { filesProcessed: totalFiles, totalFiles, nodesCreated: graph.nodeCount },
        });
      });

      if (isDev) {
        console.log(`🏘️ Community detection: ${communityResult.stats.totalCommunities} communities found (modularity: ${communityResult.stats.modularity.toFixed(3)})`);
      }

      communityResult.communities.forEach(comm => {
        graph.addNode({
          id: comm.id,
          label: 'Community' as const,
          properties: {
            name: comm.label,
            filePath: '',
            heuristicLabel: comm.heuristicLabel,
            cohesion: comm.cohesion,
            symbolCount: comm.symbolCount,
          }
        });
      });

      communityResult.memberships.forEach(membership => {
        graph.addRelationship({
          id: `${membership.nodeId}_member_of_${membership.communityId}`,
          type: 'MEMBER_OF',
          sourceId: membership.nodeId,
          targetId: membership.communityId,
          confidence: 1.0,
          reason: 'leiden-algorithm',
        });
      });

      // ── Phase 5.5: Unity resource bindings (before lifecycle injection) ─
      onProgress({
        phase: 'enriching',
        percent: 93,
        message: 'Extracting Unity resource bindings...',
        stats: { filesProcessed: totalFiles, totalFiles, nodesCreated: graph.nodeCount },
      });

      unityResult = await processUnityResources(graph, { repoPath, scopedPaths: unityScopedPaths });

      // ── Phase 5.6: Unity lifecycle synthetic calls (auto-detect) ────────
      const isUnityProject = allPaths.some(p => p.startsWith('Assets/') && p.endsWith('.cs'));
      const unityConfig = resolveUnityConfig();
      // Persistence is coupled to the Unity resource-binding indexing flow:
      // if Unity project auto-detection is active, persist lifecycle metadata.
      const persistLifecycleProcessMetadata = isUnityProject;
      const unityLifecycleSyntheticResult = isUnityProject
        ? applyUnityLifecycleSyntheticCalls(graph, {
            maxSyntheticEdgesPerClass: unityConfig.config.maxSyntheticEdgesPerClass,
            maxSyntheticEdgesTotal: unityConfig.config.maxSyntheticEdgesTotal,
          })
        : { syntheticEdgeCount: 0, lifecycleEdgeCount: 0, loaderEdgeCount: 0, hostCount: 0, rejectedHostCount: 0 };
      const syntheticEdgeDetail = unityLifecycleSyntheticResult.syntheticEdgeCount > 0
        ? ` (Unity synthetic edges: ${unityLifecycleSyntheticResult.syntheticEdgeCount})`
        : '';

      if (isDev && isUnityProject) {
        console.log(
          `[UnityLifecycle] auto-detected hosts=${unityLifecycleSyntheticResult.hostCount} syntheticEdges=${unityLifecycleSyntheticResult.syntheticEdgeCount} rejectedHosts=${unityLifecycleSyntheticResult.rejectedHostCount}`,
        );
      }

      // Phase 5.7: rule-driven binding injection (Phase 3)
      try {
        const analyzeRules = await loadAnalyzeRules(repoPath);
        const bindingResult = applyUnityRuntimeBindingRules(graph, analyzeRules, unityConfig.config);
        unityRuleBindingResult = bindingResult;
        if (isDev && bindingResult.edgesInjected > 0) {
          console.log(
            `[UnityRuleBinding] injected ${bindingResult.edgesInjected} edges from ${analyzeRules.length} rule(s)`,
          );
        }
      } catch (err) {
        // rule catalog missing or invalid — skip silently
        console.warn(`[UnityRuleBinding] failed to load or apply analyze rules: ${err instanceof Error ? err.message : String(err)}`);
        const reason = err instanceof Error ? err.message : String(err);
        unityRuleBindingResult = {
          edgesInjected: 0,
          ruleResults: [],
          diagnostics: {
            rulesEvaluated: 0,
            bindingsEvaluated: 0,
            bindingsByKind: {},
            methodLookupCalls: 0,
            methodLookupCacheHits: 0,
            sceneRuntimeTraversalCalls: 0,
            sceneRuntimeTraversalCacheHits: 0,
            sceneRuntimeResourcesVisited: 0,
            anomalies: [`failed to load/apply analyze rules: ${reason}`],
            shouldAgentReport: true,
            agentReportReason: 'failed to load/apply analyze rules',
            summary: [
              'rule_binding.summary: rules=0, bindings=0, edges=0',
              'rule_binding.bindings_by_kind: none',
              'rule_binding.lookup: method_calls=0, cache_hits=0',
              'rule_binding.scene_closure: traversals=0, cache_hits=0, visited_resources=0',
              'rule_binding.agent_report: should_report=true reason="failed to load/apply analyze rules"',
              `rule_binding.anomaly: failed to load/apply analyze rules: ${reason}`,
            ],
          },
        };
      }

      // ── Phase 6: Processes ─────────────────────────────────────────────
      onProgress({
        phase: 'processes',
        percent: 94,
        message: `Detecting execution flows...${syntheticEdgeDetail}`,
        stats: { filesProcessed: totalFiles, totalFiles, nodesCreated: graph.nodeCount },
      });

      let symbolCount = 0;
      graph.forEachNode(n => { if (n.label !== 'File') symbolCount++; });
      const dynamicMaxProcesses = Math.max(20, Math.min(300, Math.round(symbolCount / 10)));

      processResult = await processProcesses(
        graph,
        communityResult.memberships,
        (message, progress) => {
          const processProgress = 94 + (progress * 0.05);
          onProgress({
            phase: 'processes',
            percent: Math.round(processProgress),
            message,
            stats: { filesProcessed: totalFiles, totalFiles, nodesCreated: graph.nodeCount },
          });
        },
        { maxProcesses: dynamicMaxProcesses, minSteps: 3 }
      );

      if (isDev) {
        console.log(`🔄 Process detection: ${processResult.stats.totalProcesses} processes found (${processResult.stats.crossCommunityCount} cross-community)`);
      }

      processResult.processes.forEach(proc => {
        graph.addNode({
          id: proc.id,
          label: 'Process' as const,
          properties: {
            name: proc.label,
            filePath: '',
            heuristicLabel: proc.heuristicLabel,
            processType: proc.processType,
            stepCount: proc.stepCount,
            communities: proc.communities,
            entryPointId: proc.entryPointId,
            terminalId: proc.terminalId,
            ...(persistLifecycleProcessMetadata
              ? {
                processSubtype: proc.processSubtype,
                runtimeChainConfidence: proc.runtimeChainConfidence,
                sourceReasons: proc.sourceReasons,
                sourceConfidences: proc.sourceConfidences,
              }
              : {}),
          }
        });
      });

      processResult.steps.forEach(step => {
        const persistedReason = persistLifecycleProcessMetadata ? (step.reason || 'trace-detection') : 'trace-detection';
        const persistedConfidence = persistLifecycleProcessMetadata ? (step.confidence ?? 1.0) : 1.0;
        graph.addRelationship({
          id: `${step.nodeId}_step_${step.step}_${step.processId}`,
          type: 'STEP_IN_PROCESS',
          sourceId: step.nodeId,
          targetId: step.processId,
          confidence: persistedConfidence,
          reason: persistedReason,
          step: step.step,
        });
      });
    }

    onProgress({
      phase: 'complete',
      percent: 100,
      message: communityResult && processResult
        ? `Graph complete! ${communityResult.stats.totalCommunities} communities, ${processResult.stats.totalProcesses} processes detected.`
        : 'Graph complete! (graph phases skipped)',
    stats: {
      filesProcessed: totalFiles,
      totalFiles,
      nodesCreated: graph.nodeCount,
    },
  });

    astCache.clear();

    if (csharpPreprocDiagnostics) {
      csharpPreprocDiagnostics.undefinedSymbols = [...csharpUndefinedSymbols].sort();
    }

    return {
      graph,
      repoPath,
      totalFileCount: totalFiles,
      communityResult,
      processResult,
      unityResult,
      unityRuleBindingResult,
      scopeDiagnostics: scopeSelection.diagnostics,
      csharpPreprocDiagnostics,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
};
