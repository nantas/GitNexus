import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { runPipelineFromRepo } from '../core/ingestion/pipeline.js';
import { resolveAnalyzeScopeRules } from '../cli/analyze-options.js';

export interface NumericStats {
  mean: number;
  median: number;
  min: number;
  max: number;
  spread: number;
}

export interface MetricThreshold {
  medianMax: number;
  maxMax: number;
}

export interface U2PerformanceThresholds {
  metaIndexMs?: MetricThreshold;
  referenceResolveMs?: MetricThreshold;
  graphReferenceWriteMs?: MetricThreshold;
}

export interface U2ThresholdVerdict {
  pass: boolean;
  metrics: Record<string, { pass: boolean; actual: { median: number; max: number }; expected: MetricThreshold }>;
}

interface RunSample {
  run: number;
  totalMs: number;
  phases: Array<{ phase: string; durationMs: number }>;
  unity: {
    processedSymbols: number;
    bindingCount: number;
    diagnosticsTotal: number;
    timingsMs: {
      scanContext: number;
      resolve: number;
      graphWrite: number;
      total: number;
    };
  };
}

interface SamplerArgs {
  targetPath: string;
  runs: number;
  reportPath: string;
  thresholdsPath?: string;
  scopeManifest?: string;
  scopePrefix: string[];
}

export function computeNumericStats(values: number[]): NumericStats {
  if (values.length === 0) {
    return { mean: 0, median: 0, min: 0, max: 0, spread: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return {
    mean: round1(mean),
    median: round1(median),
    min: round1(min),
    max: round1(max),
    spread: round1(max - min),
  };
}

export function evaluateMetricsThresholds(
  metrics: { metaIndexMs: number[]; referenceResolveMs: number[]; graphReferenceWriteMs: number[] },
  thresholds: U2PerformanceThresholds,
): U2ThresholdVerdict {
  const verdict: U2ThresholdVerdict = { pass: true, metrics: {} };

  const entries: Array<[keyof typeof metrics, MetricThreshold | undefined]> = [
    ['metaIndexMs', thresholds.metaIndexMs],
    ['referenceResolveMs', thresholds.referenceResolveMs],
    ['graphReferenceWriteMs', thresholds.graphReferenceWriteMs],
  ];

  for (const [name, threshold] of entries) {
    if (!threshold) continue;
    const stats = computeNumericStats(metrics[name]);
    const metricPass = stats.median <= threshold.medianMax && stats.max <= threshold.maxMax;
    verdict.metrics[name] = {
      pass: metricPass,
      actual: { median: stats.median, max: stats.max },
      expected: threshold,
    };
    if (!metricPass) {
      verdict.pass = false;
    }
  }

  return verdict;
}

async function samplePipeline(targetPath: string, run: number, scopeRules: string[]): Promise<RunSample> {
  const phases: Array<{ phase: string; durationMs: number }> = [];
  let currentPhase: string | null = null;
  let phaseStart = performance.now();

  const onProgress = (progress: { phase: string }) => {
    const now = performance.now();
    if (!currentPhase) {
      currentPhase = progress.phase;
      phaseStart = now;
      return;
    }

    if (progress.phase !== currentPhase) {
      phases.push({ phase: currentPhase, durationMs: round1(now - phaseStart) });
      currentPhase = progress.phase;
      phaseStart = now;
    }
  };

  const t0 = performance.now();
  const result = await runPipelineFromRepo(targetPath, onProgress as any, {
    scopeRules,
  });
  const t1 = performance.now();

  if (currentPhase) {
    phases.push({ phase: currentPhase, durationMs: round1(t1 - phaseStart) });
  }

  return {
    run,
    totalMs: round1(t1 - t0),
    phases,
    unity: {
      processedSymbols: result.unityResult.processedSymbols,
      bindingCount: result.unityResult.bindingCount,
      diagnosticsTotal: result.unityResult.diagnostics.length,
      timingsMs: {
        scanContext: result.unityResult.timingsMs.scanContext,
        resolve: result.unityResult.timingsMs.resolve,
        graphWrite: result.unityResult.timingsMs.graphWrite,
        total: result.unityResult.timingsMs.total,
      },
    },
  };
}

function parseArgs(argv: string[]): SamplerArgs {
  const get = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    if (index === -1 || index + 1 >= argv.length) return undefined;
    return argv[index + 1];
  };

  const targetPath = get('--target-path');
  const reportPath = get('--report');
  const thresholdsPath = get('--thresholds');
  const scopeManifest = get('--scope-manifest');
  const runs = Number(get('--runs') || '3');

  const scopePrefix: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--scope-prefix' && i + 1 < argv.length) {
      scopePrefix.push(argv[i + 1]);
      i += 1;
    }
  }

  if (!targetPath) throw new Error('Missing required arg: --target-path <path>');
  if (!reportPath) throw new Error('Missing required arg: --report <path>');
  if (!Number.isFinite(runs) || runs <= 0) throw new Error('Invalid --runs, must be positive integer');

  return { targetPath: path.resolve(targetPath), runs: Math.floor(runs), reportPath: path.resolve(reportPath), thresholdsPath: thresholdsPath ? path.resolve(thresholdsPath) : undefined, scopeManifest, scopePrefix };
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const scopeRules = await resolveAnalyzeScopeRules({
    scopeManifest: args.scopeManifest,
    scopePrefix: args.scopePrefix,
  });

  const runs: RunSample[] = [];
  for (let run = 1; run <= args.runs; run += 1) {
    console.log(`[u2-sampler] run ${run}/${args.runs} ...`);
    runs.push(await samplePipeline(args.targetPath, run, scopeRules));
  }

  const metaIndexMsSeries = runs.map((entry) => entry.unity.timingsMs.scanContext);
  const referenceResolveMsSeries = runs.map((entry) => entry.unity.timingsMs.resolve);
  const graphReferenceWriteMsSeries = runs.map((entry) => entry.unity.timingsMs.graphWrite);

  let thresholdVerdict: U2ThresholdVerdict | null = null;
  if (args.thresholdsPath) {
    const raw = await fs.readFile(args.thresholdsPath, 'utf-8');
    const thresholds = JSON.parse(raw) as U2PerformanceThresholds;
    thresholdVerdict = evaluateMetricsThresholds(
      {
        metaIndexMs: metaIndexMsSeries,
        referenceResolveMs: referenceResolveMsSeries,
        graphReferenceWriteMs: graphReferenceWriteMsSeries,
      },
      thresholds,
    );
  }

  const report = {
    capturedAt: new Date().toISOString(),
    targetPath: args.targetPath,
    runs: args.runs,
    scope: {
      scopeManifest: args.scopeManifest || null,
      scopePrefix: args.scopePrefix,
      scopeRuleCount: scopeRules.length,
    },
    samples: runs,
    metrics: {
      metaIndexMs: computeNumericStats(metaIndexMsSeries),
      referenceResolveMs: computeNumericStats(referenceResolveMsSeries),
      graphReferenceWriteMs: computeNumericStats(graphReferenceWriteMsSeries),
      unityTotalMs: computeNumericStats(runs.map((entry) => entry.unity.timingsMs.total)),
      pipelineTotalMs: computeNumericStats(runs.map((entry) => entry.totalMs)),
    },
    notes: {
      metaIndexMsDefinition: 'Current implementation uses unity.timingsMs.scanContext as metaIndexMs proxy (scanContext includes meta index + resource scan + asset meta index).',
    },
    thresholdVerdict,
  };

  await fs.mkdir(path.dirname(args.reportPath), { recursive: true });
  await fs.writeFile(args.reportPath, JSON.stringify(report, null, 2));
  console.log(`[u2-sampler] report written: ${args.reportPath}`);

  if (thresholdVerdict && !thresholdVerdict.pass) {
    process.exitCode = 1;
  }
}

const modulePath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (import.meta.url === `file://${modulePath}`) {
  main().catch((error) => {
    console.error(`[u2-sampler] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
