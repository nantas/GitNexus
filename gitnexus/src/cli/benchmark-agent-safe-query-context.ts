import path from 'node:path';
import { runAnalyze } from '../benchmark/analyze-runner.js';
import { loadAgentSafeQueryContextSuite } from '../benchmark/agent-safe-query-context/io.js';
import {
  runAgentSafeQueryContextBenchmark,
  writeAgentSafeQueryContextReports,
  type AgentSafeQueryContextBenchmarkReport,
} from '../benchmark/agent-safe-query-context/report.js';
import type { AgentSafeBenchmarkSuite } from '../benchmark/agent-safe-query-context/types.js';

export async function benchmarkAgentSafeQueryContextCommand(
  dataset: string,
  options: {
    repo?: string;
    repoAlias?: string;
    targetPath?: string;
    reportDir?: string;
    subagentRunsDir?: string;
    extensions?: string;
    skipAnalyze?: boolean;
  },
  deps?: {
    loadSuite?: (root: string) => Promise<AgentSafeBenchmarkSuite>;
    runBenchmark?: typeof runAgentSafeQueryContextBenchmark;
    writeReports?: typeof writeAgentSafeQueryContextReports;
    writeLine?: (line: string) => void;
    analyze?: typeof runAnalyze;
  },
) {
  const loadSuite = deps?.loadSuite || loadAgentSafeQueryContextSuite;
  const runBenchmark = deps?.runBenchmark || runAgentSafeQueryContextBenchmark;
  const writeReports = deps?.writeReports || writeAgentSafeQueryContextReports;
  const writeLine = deps?.writeLine || ((line: string) => process.stderr.write(`${line}\n`));
  const analyze = deps?.analyze || runAnalyze;
  const reportDir = path.resolve(options.reportDir || '.gitnexus/benchmark-agent-safe-query-context');

  if (!(options.skipAnalyze ?? false)) {
    if (!options.targetPath) {
      throw new Error('targetPath is required unless skipAnalyze is true');
    }
    await analyze(path.resolve(options.targetPath), {
      extensions: options.extensions,
      repoAlias: options.repoAlias,
    });
  }

  const suite = await loadSuite(path.resolve(dataset));
  const report = await runBenchmark(suite, {
    repo: options.repo || options.repoAlias || (options.targetPath ? path.basename(path.resolve(options.targetPath)) : undefined),
    subagentRunsDir: options.subagentRunsDir ? path.resolve(options.subagentRunsDir) : undefined,
  });

  await writeReports(reportDir, report);
  writeLine(`${report.pass ? 'PASS' : 'FAIL'}`);
  for (const key of ['weapon_powerup', 'reload'] as const) {
    const row = report.workflow_replay_slim[key];
    writeLine(
      `${key}: guid_invariance_pass=${row.guid_invariance_pass}, live_tool_evidence_pass=${row.live_tool_evidence_pass}, freeze_ready=${row.freeze_ready}, confirmed_chain_steps=${row.confirmed_chain.steps.length}, placeholder_leak_detected=${row.placeholder_leak_detected}, heuristic_top_summary_detected=${row.heuristic_top_summary_detected}`,
    );
  }
  writeLine(`Report: ${reportDir}`);

  if (!report.pass) {
    process.exitCode = 1;
  }

  return report;
}
