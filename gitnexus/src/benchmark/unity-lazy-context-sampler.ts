import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface UnityLazyContextMetrics {
  coldMs: number;
  warmMs: number;
  coldMaxRssBytes: number;
  warmMaxRssBytes: number;
}

export interface UnityLazyContextThresholds {
  coldMsMax?: number;
  warmMsMax?: number;
  coldMaxRssBytesMax?: number;
  warmMaxRssBytesMax?: number;
}

export interface UnityLazyThresholdVerdict {
  pass: boolean;
  checks: Record<string, { pass: boolean; actual: number; expected: number }>;
}

export interface UnityLazyContextSample {
  durationMs: number;
  maxRssBytes: number;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface UnityLazyContextSamplerConfig {
  targetPath: string;
  repo: string;
  symbol: string;
  file: string;
  thresholds?: UnityLazyContextThresholds;
}

export type UnityLazyContextRunner = (input: UnityLazyContextSamplerConfig & { warm: boolean }) => Promise<UnityLazyContextSample>;

export function evaluateUnityLazyContextThresholds(
  metrics: UnityLazyContextMetrics,
  thresholds?: UnityLazyContextThresholds,
): UnityLazyThresholdVerdict {
  const verdict: UnityLazyThresholdVerdict = { pass: true, checks: {} };
  if (!thresholds) {
    return verdict;
  }

  const checks: Array<[string, number, number | undefined]> = [
    ['coldMs', metrics.coldMs, thresholds.coldMsMax],
    ['warmMs', metrics.warmMs, thresholds.warmMsMax],
    ['coldMaxRssBytes', metrics.coldMaxRssBytes, thresholds.coldMaxRssBytesMax],
    ['warmMaxRssBytes', metrics.warmMaxRssBytes, thresholds.warmMaxRssBytesMax],
  ];

  for (const [name, actual, expected] of checks) {
    if (typeof expected !== 'number') continue;
    const pass = actual <= expected;
    verdict.checks[name] = { pass, actual, expected };
    if (!pass) verdict.pass = false;
  }

  return verdict;
}

export async function runUnityLazyContextSampler(
  runner: UnityLazyContextRunner,
  config: UnityLazyContextSamplerConfig,
): Promise<{
  capturedAt: string;
  config: Omit<UnityLazyContextSamplerConfig, 'thresholds'>;
  metrics: UnityLazyContextMetrics;
  thresholdVerdict: UnityLazyThresholdVerdict;
}> {
  const cold = await runner({ ...config, warm: false });
  if (cold.exitCode !== 0) {
    throw new Error(`Cold run failed: ${cold.stderr || cold.stdout}`);
  }

  const warm = await runner({ ...config, warm: true });
  if (warm.exitCode !== 0) {
    throw new Error(`Warm run failed: ${warm.stderr || warm.stdout}`);
  }

  const metrics: UnityLazyContextMetrics = {
    coldMs: round1(cold.durationMs),
    warmMs: round1(warm.durationMs),
    coldMaxRssBytes: cold.maxRssBytes,
    warmMaxRssBytes: warm.maxRssBytes,
  };

  return {
    capturedAt: new Date().toISOString(),
    config: {
      targetPath: config.targetPath,
      repo: config.repo,
      symbol: config.symbol,
      file: config.file,
    },
    metrics,
    thresholdVerdict: evaluateUnityLazyContextThresholds(metrics, config.thresholds),
  };
}

async function runCliContextSample(input: UnityLazyContextSamplerConfig & { warm: boolean }): Promise<UnityLazyContextSample> {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);
  const cliPath = path.resolve(thisDir, '../cli/index.js');
  const args = [
    '-l',
    'node',
    cliPath,
    'context',
    input.symbol,
    '--repo',
    input.repo,
    '--file',
    input.file,
    '--unity-resources',
    'auto',
  ];

  const startedAt = Date.now();
  const proc = spawn('/usr/bin/time', args, { cwd: input.targetPath, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  const exitCode: number = await new Promise((resolve) => {
    proc.on('close', (code) => resolve(code ?? 1));
  });

  const rssMatch = stderr.match(/maximum resident set size[^0-9]*([0-9]+)|([0-9]+)\s+maximum resident set size/i);
  const maxRssBytes = rssMatch ? Number(rssMatch[1] || rssMatch[2] || 0) : 0;

  return {
    durationMs: Date.now() - startedAt,
    maxRssBytes,
    exitCode,
    stdout,
    stderr,
  };
}

interface CliArgs {
  targetPath: string;
  repo: string;
  symbol: string;
  file: string;
  thresholds?: string;
  report?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const get = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    if (index === -1 || index + 1 >= argv.length) return undefined;
    return argv[index + 1];
  };

  const targetPath = get('--target-path');
  const repo = get('--repo');
  const symbol = get('--symbol');
  const file = get('--file');
  if (!targetPath) throw new Error('Missing required arg: --target-path <path>');
  if (!repo) throw new Error('Missing required arg: --repo <repo>');
  if (!symbol) throw new Error('Missing required arg: --symbol <symbol>');
  if (!file) throw new Error('Missing required arg: --file <file>');

  return {
    targetPath: path.resolve(targetPath),
    repo,
    symbol,
    file,
    thresholds: get('--thresholds') ? path.resolve(get('--thresholds')!) : undefined,
    report: get('--report') ? path.resolve(get('--report')!) : undefined,
  };
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const thresholds = args.thresholds
    ? JSON.parse(await fs.readFile(args.thresholds, 'utf-8')) as UnityLazyContextThresholds
    : undefined;

  const report = await runUnityLazyContextSampler(runCliContextSample, {
    targetPath: args.targetPath,
    repo: args.repo,
    symbol: args.symbol,
    file: args.file,
    thresholds,
  });

  const payload = JSON.stringify(report, null, 2);
  if (args.report) {
    await fs.mkdir(path.dirname(args.report), { recursive: true });
    await fs.writeFile(args.report, payload, 'utf-8');
    console.log(`[unity-lazy-context-sampler] report written: ${args.report}`);
  }
  console.log(payload);

  if (!report.thresholdVerdict.pass) {
    process.exitCode = 1;
  }
}

const modulePath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (import.meta.url === `file://${modulePath}`) {
  main().catch((error) => {
    console.error(`[unity-lazy-context-sampler] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
