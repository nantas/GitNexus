import { spawn } from 'node:child_process';

export function parseAnalyzeSummary(output: string) {
  const timeMatch = output.match(/indexed successfully \(([\d.]+)s\)/i);
  const graphMatch = output.match(/([\d,]+)\s+nodes\s+\|\s+([\d,]+)\s+edges/i);

  return {
    totalSeconds: timeMatch ? Number(timeMatch[1]) : Number.NaN,
    nodes: graphMatch ? Number(graphMatch[1].replace(/,/g, '')) : Number.NaN,
    edges: graphMatch ? Number(graphMatch[2].replace(/,/g, '')) : Number.NaN,
  };
}

export async function runAnalyze(repoPath: string, extensions: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'node',
      ['dist/cli/index.js', 'analyze', '--force', '--extensions', extensions, repoPath],
      { cwd: process.cwd() },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`analyze failed: ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
    child.on('error', reject);
  });
}
