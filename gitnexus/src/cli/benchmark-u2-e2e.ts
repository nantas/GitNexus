import path from 'node:path';
import { runNeonsparkU2E2E } from '../benchmark/u2-e2e/neonspark-full-e2e.js';

export interface U2E2EArgs {
  configPath: string;
  reportDir?: string;
}

export function resolveU2E2EArgs(argv: string[]): U2E2EArgs {
  const findValue = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    if (index === -1 || index + 1 >= argv.length) return undefined;
    return argv[index + 1];
  };

  const config = findValue('--config') || '../benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json';
  const reportDir = findValue('--report-dir');

  return {
    configPath: path.resolve(config),
    ...(reportDir ? { reportDir: path.resolve(reportDir) } : {}),
  };
}

export async function benchmarkU2E2ECommand(options: { config?: string; reportDir?: string }) {
  const result = await runNeonsparkU2E2E({
    configPath: path.resolve(options.config || '../benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json'),
    reportDir: options.reportDir ? path.resolve(options.reportDir) : undefined,
  });

  if (result.status === 'failed') {
    process.stderr.write(`FAIL\n`);
    process.stderr.write(`Run ID: ${result.runId}\n`);
    process.stderr.write(`Failed Gate: ${result.failedGate}\n`);
    process.stderr.write(`Report: ${result.reportDir}\n`);
    process.stderr.write(`Error: ${result.error}\n`);
    process.exitCode = 1;
    return result;
  }

  process.stderr.write('PASS\n');
  process.stderr.write(`Run ID: ${result.runId}\n`);
  process.stderr.write(`Report: ${result.reportDir}\n`);
  return result;
}
