import { describe, it, expect } from 'vitest'

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeAgentContextReports } from './report.js';

it('writes benchmark-report.json and benchmark-summary.md with scenario breakdown', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-context-report-'));
  const result = {
    pass: true,
    failures: [],
    reportDir: outDir,
    metrics: {
      avgCoverage: 1,
      avgToolCalls: 3,
      mandatoryTargetPassRate: 1,
    },
    scenarios: [
      {
        scenarioId: 'sample-refactor-context',
        targetUid: 'Class:Sample:Target',
        toolCalls: 3,
        coverage: 1,
        gatePass: true,
        checks: [
          { id: 'T', pass: true },
          { id: 'E', pass: true },
        ],
        stepOutputs: [],
      },
    ],
  };

  await writeAgentContextReports(outDir, result);

  const jsonPath = path.join(outDir, 'benchmark-report.json');
  const mdPath = path.join(outDir, 'benchmark-summary.md');
  await fs.access(jsonPath);
  await fs.access(mdPath);

  const summary = await fs.readFile(mdPath, 'utf-8');
  expect(summary).toMatch(/sample-refactor-context/);
  expect(summary).toMatch(/coverage/i);
});

it('summary includes failure classes and triage order for failing runs', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-context-report-fail-'));
  const result = {
    pass: false,
    failures: ['scenario.a.coverage', 'suite.coverage'],
    reportDir: outDir,
    metrics: {
      avgCoverage: 0.6,
      avgToolCalls: 3,
      mandatoryTargetPassRate: 1,
    },
    scenarios: [
      {
        scenarioId: 'a',
        targetUid: 'Class:Sample:A',
        toolCalls: 3,
        coverage: 0.5,
        gatePass: false,
        checks: [
          { id: 'U', pass: false, detail: 'incoming refs 1 < 8' },
          { id: 'D', pass: false, detail: 'outgoing refs 2 < 8' },
        ],
        stepOutputs: [],
      },
      {
        scenarioId: 'b',
        targetUid: 'Class:Sample:B',
        toolCalls: 3,
        coverage: 0.7,
        gatePass: false,
        checks: [
          { id: 'U', pass: false, detail: 'incoming refs 2 < 6' },
          { id: 'I', pass: false, detail: 'internal anchors matched 0 < 2' },
        ],
        stepOutputs: [],
      },
    ],
  };

  await writeAgentContextReports(outDir, result);
  const summary = await fs.readFile(path.join(outDir, 'benchmark-summary.md'), 'utf-8');
  expect(summary).toMatch(/Top Failure Classes/i);
  expect(summary).toMatch(/Recommended Triage Order/i);
  expect(summary).toMatch(/U/);
});
