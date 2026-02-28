import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeReports(reportDir: string, jsonReport: unknown, markdown: string) {
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(
    path.join(reportDir, 'benchmark-report.json'),
    JSON.stringify(jsonReport, null, 2),
    'utf-8',
  );
  await fs.writeFile(path.join(reportDir, 'benchmark-summary.md'), markdown, 'utf-8');
}
