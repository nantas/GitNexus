import { spawn } from 'node:child_process';

export interface AnalyzeRunOptions {
  extensions?: string;
  repoAlias?: string;
}

export function parseAnalyzeSummary(output: string) {
  const timeMatch = output.match(/indexed successfully \(([\d.]+)s\)/i);
  const graphMatch = output.match(/([\d,]+)\s+nodes\s+\|\s+([\d,]+)\s+edges/i);

  return {
    totalSeconds: timeMatch ? Number(timeMatch[1]) : Number.NaN,
    nodes: graphMatch ? Number(graphMatch[1].replace(/,/g, '')) : Number.NaN,
    edges: graphMatch ? Number(graphMatch[2].replace(/,/g, '')) : Number.NaN,
  };
}

export function buildAnalyzeArgs(repoPath: string, options: AnalyzeRunOptions): string[] {
  const args = [
    'dist/cli/index.js',
    'analyze',
    '--force',
  ];

  if (options.extensions !== undefined) {
    args.push('--extensions', options.extensions);
  }
  args.push(repoPath);

  if (options.repoAlias) {
    args.push('--repo-alias', options.repoAlias);
  }
  return args;
}

export async function runAnalyze(repoPath: string, options: AnalyzeRunOptions): Promise<{ stdout: string; stderr: string }> {
  const { analyzeCommand } = await import('../cli/analyze.js');
  const originalLog = console.log;
  const originalWarn = console.warn;
  let stdout = '';
  let stderr = '';
  console.log = (...args: unknown[]) => { stdout += args.join(' ') + '\n'; };
  console.warn = (...args: unknown[]) => { stderr += args.join(' ') + '\n'; };
  try {
    await analyzeCommand(repoPath, {
      force: true,
      extensions: options.extensions,
      name: options.repoAlias,
    });
    return { stdout, stderr };
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}
