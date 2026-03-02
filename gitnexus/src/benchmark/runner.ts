import path from 'node:path';
import { runAnalyze, parseAnalyzeSummary } from './analyze-runner.js';
import { evaluateGates, computePR, computeF1 } from './scoring.js';
import { buildFailureTriage } from './evaluators.js';
import { writeReports } from './report.js';
import type { RelationCase, SymbolCase, TaskCase, Thresholds } from './types.js';
import { createToolRunner } from './tool-runner.js';

interface Dataset {
  thresholds: Thresholds;
  symbols: SymbolCase[];
  relations: RelationCase[];
  tasks: TaskCase[];
}

interface ProfileConfig {
  maxSymbols: number;
  maxTasks: number;
}

interface RunBenchmarkOptions {
  repo?: string;
  repoAlias?: string;
  targetPath?: string;
  profile: ProfileConfig;
  reportDir?: string;
  extensions: string;
  scopeManifest?: string;
  scopePrefix?: string[];
  skipAnalyze: boolean;
}

interface BenchmarkFailure {
  kind: string;
  taskIndex?: number;
  detail?: string;
}

interface TaskEvalResult {
  smokePass: boolean;
  tool: TaskCase['tool'];
  hits: string[];
  names: string[];
  truePositive: number;
  predicted: number;
  gold: number;
  failures: BenchmarkFailure[];
}

export interface BenchmarkResult {
  pass: boolean;
  failures: string[];
  metrics: {
    queryPrecision: number;
    queryRecall: number;
    contextImpactF1: number;
    smokePassRate: number;
    perfRegressionPct: number;
  };
  triage: Array<{ kind: string; count: number }>;
  analyze?: { totalSeconds: number; nodes: number; edges: number };
  reportDir: string;
}

export function resolveBenchmarkRepoName(options: Pick<RunBenchmarkOptions, 'repo' | 'repoAlias' | 'targetPath'>): string | undefined {
  return options.repo || options.repoAlias || (options.targetPath ? path.basename(path.resolve(options.targetPath)) : undefined);
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function expectedName(uid: string): string {
  const last = uid.split(':').pop() || uid;
  return normalize(last);
}

function extractHits(result: any): { uids: string[]; names: string[] } {
  const uids = new Set<string>();
  const names = new Set<string>();

  const addUid = (uid: unknown) => {
    if (typeof uid === 'string' && uid.trim()) {
      uids.add(uid.trim());
    }
  };

  const addName = (name: unknown) => {
    if (typeof name === 'string' && name.trim()) {
      names.add(name.trim());
    }
  };

  for (const sym of result?.process_symbols || []) {
    addUid(sym?.id);
    addName(sym?.name);
  }
  for (const def of result?.definitions || []) {
    addUid(def?.id);
    addName(def?.name);
  }

  addUid(result?.symbol?.uid);
  addName(result?.symbol?.name);

  addUid(result?.target?.id);
  addName(result?.target?.name);

  for (const depthRows of Object.values(result?.byDepth || {})) {
    if (!Array.isArray(depthRows)) continue;
    for (const row of depthRows) {
      addUid((row as any)?.id);
      addName((row as any)?.name);
    }
  }

  for (const candidate of result?.candidates || []) {
    addUid(candidate?.uid);
    addName(candidate?.name);
  }

  return { uids: [...uids], names: [...names] };
}

export function hasRequiredHitFuzzy(expectedUid: string, hitUids: string[], hitNames: string[]): boolean {
  const expectedNorm = normalize(expectedUid);
  const expectedLooksLikeUid = expectedUid.includes(':');

  if (expectedLooksLikeUid) {
    for (const uid of hitUids) {
      const n = normalize(uid);
      if (n === expectedNorm || n.endsWith(expectedNorm) || expectedNorm.endsWith(n)) {
        return true;
      }
    }
    return false;
  }

  const expectedSym = expectedName(expectedUid);

  for (const uid of hitUids) {
    const n = normalize(uid);
    if (expectedSym && n.includes(expectedSym)) {
      return true;
    }
  }

  for (const name of hitNames) {
    const n = normalize(name);
    if (n === expectedSym || n.includes(expectedSym) || expectedSym.includes(n)) {
      return true;
    }
  }

  return false;
}

export function hasForbiddenUidHitStrict(forbiddenUid: string, hitUids: string[]): boolean {
  const forbiddenNorm = normalize(forbiddenUid);
  return hitUids.some((uid) => normalize(uid) === forbiddenNorm);
}

function mapToolInput(task: TaskCase, repo?: string): Record<string, unknown> {
  const input = { ...(task.input || {}) } as Record<string, unknown>;
  if (repo) {
    input.repo = repo;
  }

  if (task.tool === 'query') {
    if (!('query' in input) && typeof input.search_query === 'string') {
      input.query = input.search_query;
    }
  }

  if (task.tool === 'impact' && !('direction' in input)) {
    input.direction = 'upstream';
  }

  return input;
}

function resultCount(tool: TaskCase['tool'], result: any): number {
  if (tool === 'query') {
    return (result?.process_symbols?.length || 0) + (result?.definitions?.length || 0);
  }
  if (tool === 'context') {
    const incoming = Object.values(result?.incoming || {}).flat().length;
    const outgoing = Object.values(result?.outgoing || {}).flat().length;
    return incoming + outgoing + (result?.processes?.length || 0) + (result?.symbol ? 1 : 0);
  }
  if (tool === 'impact') {
    return Number(result?.impactedCount || 0) + (result?.target ? 1 : 0);
  }
  return 0;
}

async function evaluateTask(
  index: number,
  task: TaskCase,
  runTool: (tool: TaskCase['tool'], params: any) => Promise<any>,
  repo?: string,
): Promise<TaskEvalResult> {
  const failures: BenchmarkFailure[] = [];

  try {
    const params = mapToolInput(task, repo);
    const result = await runTool(task.tool, params);

    if (result?.error) {
      return {
        smokePass: false,
        tool: task.tool,
        hits: [],
        names: [],
        truePositive: 0,
        predicted: 0,
        gold: task.must_hit_uids.length,
        failures: [{ kind: 'tool-error', taskIndex: index, detail: String(result.error) }],
      };
    }

    if (result?.status === 'ambiguous') {
      failures.push({ kind: 'ambiguous-name-wrong-hit', taskIndex: index, detail: result?.message });
    }

    const hits = extractHits(result);
    const predicted = hits.uids.length;
    const gold = task.must_hit_uids.length;

    let truePositive = 0;
    for (const expected of task.must_hit_uids) {
      if (hasRequiredHitFuzzy(expected, hits.uids, hits.names)) {
        truePositive += 1;
      } else {
        failures.push({ kind: 'missing-required-hit', taskIndex: index, detail: expected });
      }
    }

    for (const forbidden of task.must_not_hit_uids) {
      if (hasForbiddenUidHitStrict(forbidden, hits.uids)) {
        failures.push({ kind: 'forbidden-hit-present', taskIndex: index, detail: forbidden });
      }
    }

    const count = resultCount(task.tool, result);
    if (typeof task.min_result_count === 'number' && count < task.min_result_count) {
      failures.push({ kind: 'insufficient-result-count', taskIndex: index, detail: `${count} < ${task.min_result_count}` });
    }

    if (task.tool === 'context') {
      const refs = Object.values(result?.incoming || {}).flat().length + Object.values(result?.outgoing || {}).flat().length;
      if (refs === 0) {
        failures.push({ kind: 'context-empty-refs', taskIndex: index });
      }
    }

    if (task.tool === 'impact' && Number(result?.impactedCount || 0) === 0) {
      failures.push({ kind: 'impact-downstream-zero', taskIndex: index });
    }

    return {
      smokePass: !result?.error,
      tool: task.tool,
      hits: hits.uids,
      names: hits.names,
      truePositive,
      predicted,
      gold,
      failures,
    };
  } catch (error: any) {
    return {
      smokePass: false,
      tool: task.tool,
      hits: [],
      names: [],
      truePositive: 0,
      predicted: 0,
      gold: task.must_hit_uids.length,
      failures: [{ kind: 'tool-execution-error', taskIndex: index, detail: String(error?.message || error) }],
    };
  }
}

export async function runBenchmark(ds: Dataset, options: RunBenchmarkOptions): Promise<BenchmarkResult> {
  const reportDir = path.resolve(options.reportDir || '.gitnexus/benchmark');
  const repo = resolveBenchmarkRepoName(options);

  let analyzeSummary: { totalSeconds: number; nodes: number; edges: number } | undefined;
  if (!options.skipAnalyze) {
    if (!options.targetPath) {
      throw new Error('targetPath is required unless skipAnalyze is true');
    }
    const analyze = await runAnalyze(path.resolve(options.targetPath), {
      extensions: options.extensions,
      repoAlias: options.repoAlias,
      scopeManifest: options.scopeManifest,
      scopePrefix: options.scopePrefix,
    });
    analyzeSummary = parseAnalyzeSummary(`${analyze.stdout}\n${analyze.stderr}`);
  }

  const limitedTasks = ds.tasks.slice(0, options.profile.maxTasks);
  const limitedSymbols = ds.symbols.slice(0, options.profile.maxSymbols);

  const toolRunner = await createToolRunner();
  const failures: BenchmarkFailure[] = [];

  let queryTP = 0;
  let queryPred = 0;
  let queryGold = 0;

  let ciTP = 0;
  let ciPred = 0;
  let ciGold = 0;

  let smokePassCount = 0;

  const runTool = async (tool: TaskCase['tool'], params: any): Promise<any> => {
    if (tool === 'query') {
      return toolRunner.query(params);
    }
    if (tool === 'context') {
      return toolRunner.context(params);
    }
    return toolRunner.impact(params);
  };

  try {
    for (let i = 0; i < limitedTasks.length; i += 1) {
      const task = limitedTasks[i];
      const evalResult = await evaluateTask(i, task, runTool, repo);

      if (evalResult.smokePass) {
        smokePassCount += 1;
      }
      failures.push(...evalResult.failures);

      if (task.tool === 'query') {
        queryTP += evalResult.truePositive;
        queryPred += evalResult.predicted;
        queryGold += evalResult.gold;
      } else {
        ciTP += evalResult.truePositive;
        ciPred += evalResult.predicted;
        ciGold += evalResult.gold;
      }
    }
  } finally {
    await toolRunner.close();
  }

  if (limitedSymbols.length === 0) {
    failures.push({ kind: 'dataset-empty-symbols' });
  }
  if (ds.relations.length === 0) {
    failures.push({ kind: 'dataset-empty-relations' });
  }

  const queryPR = queryGold > 0 || queryPred > 0 ? computePR(queryTP, queryPred, queryGold) : { precision: 1, recall: 1 };
  const ciPR = ciGold > 0 || ciPred > 0 ? computePR(ciTP, ciPred, ciGold) : { precision: 1, recall: 1 };

  const metrics = {
    queryPrecision: queryPR.precision,
    queryRecall: queryPR.recall,
    contextImpactF1: computeF1(ciPR.precision, ciPR.recall),
    smokePassRate: limitedTasks.length === 0 ? 1 : smokePassCount / limitedTasks.length,
    perfRegressionPct: 0,
  };

  const gateResult = evaluateGates(metrics, ds.thresholds);
  const triage = buildFailureTriage(failures);

  const jsonReport = {
    generatedAt: new Date().toISOString(),
    repo,
    profile: options.profile,
    metrics,
    thresholds: ds.thresholds,
    gate: gateResult,
    analyze: analyzeSummary,
    triage,
    failures,
    stats: {
      symbols: limitedSymbols.length,
      relations: ds.relations.length,
      tasks: limitedTasks.length,
    },
  };

  const markdown = [
    '# Unity Benchmark Summary',
    '',
    `- Pass: ${gateResult.pass ? 'YES' : 'NO'}`,
    `- Query Precision: ${metrics.queryPrecision.toFixed(3)}`,
    `- Query Recall: ${metrics.queryRecall.toFixed(3)}`,
    `- Context/Impact F1: ${metrics.contextImpactF1.toFixed(3)}`,
    `- Smoke Pass Rate: ${metrics.smokePassRate.toFixed(3)}`,
    `- Perf Regression: ${metrics.perfRegressionPct.toFixed(2)}%`,
    gateResult.failures.length > 0 ? `- Gate Failures: ${gateResult.failures.join(', ')}` : '- Gate Failures: none',
  ].join('\n');

  await writeReports(reportDir, jsonReport, markdown);

  return {
    pass: gateResult.pass,
    failures: gateResult.failures,
    metrics,
    triage,
    analyze: analyzeSummary,
    reportDir,
  };
}
