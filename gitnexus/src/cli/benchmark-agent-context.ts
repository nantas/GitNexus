import path from 'node:path';
import { runAnalyze } from '../benchmark/analyze-runner.js';
import { loadAgentContextDataset } from '../benchmark/agent-context/io.js';
import { writeAgentContextReports } from '../benchmark/agent-context/report.js';
import { runAgentContextBenchmark } from '../benchmark/agent-context/runner.js';
import type { AgentContextDataset } from '../benchmark/agent-context/types.js';

export function resolveAgentContextProfile(profile: string) {
  if (profile === 'quick') {
    return { maxScenarios: 1 };
  }

  return { maxScenarios: Number.MAX_SAFE_INTEGER };
}

export function resolveAgentContextRepoName(options: {
  repo?: string;
  repoAlias?: string;
  targetPath?: string;
}): string | undefined {
  return options.repo || options.repoAlias || (options.targetPath ? path.basename(path.resolve(options.targetPath)) : undefined);
}

export async function benchmarkAgentContextCommand(
  dataset: string,
  options: {
    profile?: string;
    repo?: string;
    repoAlias?: string;
    targetPath?: string;
    reportDir?: string;
    extensions?: string;
    scopeManifest?: string;
    scopePrefix?: string[];
    skipAnalyze?: boolean;
  },
  deps?: {
    loadDataset?: (root: string) => Promise<AgentContextDataset>;
    runBenchmark?: typeof runAgentContextBenchmark;
    writeReports?: typeof writeAgentContextReports;
    writeLine?: (line: string) => void;
    analyze?: typeof runAnalyze;
  },
) {
  const loadDataset = deps?.loadDataset || loadAgentContextDataset;
  const runBenchmark = deps?.runBenchmark || runAgentContextBenchmark;
  const writeReports = deps?.writeReports || writeAgentContextReports;
  const writeLine = deps?.writeLine || ((line: string) => process.stderr.write(`${line}\n`));
  const analyze = deps?.analyze || runAnalyze;

  const profile = options.profile || 'quick';
  const profileConfig = resolveAgentContextProfile(profile);
  const reportDir = path.resolve(options.reportDir || '.gitnexus/benchmark-agent-context');

  if (!(options.skipAnalyze ?? false)) {
    if (!options.targetPath) {
      throw new Error('targetPath is required unless skipAnalyze is true');
    }
    const analyzePath = path.resolve(options.targetPath);
    const analyzeOptions = {
      extensions: options.extensions || '.cs',
      repoAlias: options.repoAlias,
      scopeManifest: options.scopeManifest,
      scopePrefix: options.scopePrefix,
    };

    try {
      await analyze(analyzePath, analyzeOptions);
    } catch (error: any) {
      const message = String(error?.message || error);
      if (!message.includes('analyze failed: null')) {
        throw error;
      }
      // Retry once for transient child-process exits (observed as code=null).
      await analyze(analyzePath, analyzeOptions);
    }
  }

  const datasetRoot = path.resolve(dataset);
  const ds = await loadDataset(datasetRoot);
  const result = await runBenchmark(ds, {
    repo: resolveAgentContextRepoName(options),
    reportDir,
    profile: profileConfig,
  });

  await writeReports(reportDir, result);
  writeLine(`${result.pass ? 'PASS' : 'FAIL'}`);
  writeLine(`Report: ${result.reportDir}`);

  if (!result.pass) {
    process.exitCode = 1;
  }

  return result;
}
