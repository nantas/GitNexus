import path from 'node:path';
import { loadBenchmarkDataset } from '../benchmark/io.js';
import { runBenchmark } from '../benchmark/runner.js';

export function resolveProfileConfig(profile: string) {
  if (profile === 'quick') {
    return { maxSymbols: 10, maxTasks: 5 };
  }
  return { maxSymbols: Number.MAX_SAFE_INTEGER, maxTasks: Number.MAX_SAFE_INTEGER };
}

export async function benchmarkUnityCommand(
  dataset: string,
  options: {
    profile?: string;
    repo?: string;
    repoAlias?: string;
    targetPath?: string;
    reportDir?: string;
    extensions?: string;
    skipAnalyze?: boolean;
  },
) {
  const profile = options.profile || 'quick';
  const profileConfig = resolveProfileConfig(profile);
  const datasetRoot = path.resolve(dataset);
  const ds = await loadBenchmarkDataset(datasetRoot);

  const result = await runBenchmark(ds, {
    repo: options.repo,
    repoAlias: options.repoAlias,
    targetPath: options.targetPath,
    profile: profileConfig,
    reportDir: options.reportDir,
    extensions: options.extensions,
    skipAnalyze: options.skipAnalyze ?? false,
  });

  process.stderr.write(`${result.pass ? 'PASS' : 'FAIL'}\n`);
  process.stderr.write(`Report: ${result.reportDir}\n`);

  if (!result.pass) {
    process.exitCode = 1;
  }
}
