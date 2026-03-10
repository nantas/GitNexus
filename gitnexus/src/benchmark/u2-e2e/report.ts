import fs from 'node:fs/promises';
import path from 'node:path';

export interface U2EstimateComparison {
  status: string;
  inRange: boolean;
  actualSec: number;
  lower: number;
  upper: number;
  deltaSec: number;
}

export interface U2SymbolOutcome {
  symbol: string;
  pass: boolean;
  stepCount: number;
  durationMs?: number;
  totalTokensEst?: number;
  failures?: string[];
}

export interface U2CharacterListAssetRefSpriteSummary {
  extractedAssetRefInstances: number;
  nonEmptyAssetRefInstances: number;
  spriteAssetRefInstances: number;
  spriteRatioInNonEmpty: number | null;
  uniqueSpriteAssets: number;
}

export interface U2RetrievalSummary {
  symbols: U2SymbolOutcome[];
  tokenSummary?: {
    totalTokensEst: number;
    totalDurationMs: number;
  };
  serializedTypeEdgeCount?: number;
  characterListAssetRefSprite?: U2CharacterListAssetRefSpriteSummary;
  failures?: string[];
}

export interface FinalVerdictInput {
  runId: string;
  buildTimings?: {
    buildMs?: number;
    pipelineProfileMs?: number;
    analyzeSec?: number;
  };
  estimateComparison?: U2EstimateComparison;
  retrievalSummary?: U2RetrievalSummary;
  failures?: string[];
}

export interface E2EReportWriteInput {
  preflight?: unknown;
  scopeCounts?: unknown;
  pipelineProfile?: unknown;
  analyzeSummary?: unknown;
  estimateComparison?: U2EstimateComparison;
  retrievalSteps?: unknown[];
  retrievalSummary?: U2RetrievalSummary;
  finalVerdict: FinalVerdictInput;
}

function formatMs(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return `${value.toFixed(1)}ms`;
}

function formatSec(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return `${value.toFixed(1)}s`;
}

export function buildEstimateComparisonMarkdown(estimate?: U2EstimateComparison): string {
  if (!estimate) {
    return '# Estimate Comparison\n\nNo estimate comparison data.\n';
  }

  return [
    '# Estimate Comparison',
    '',
    `- Status: ${estimate.status}`,
    `- In Range: ${estimate.inRange ? 'YES' : 'NO'}`,
    `- Actual: ${estimate.actualSec.toFixed(1)}s`,
    `- Expected Range: ${estimate.lower.toFixed(1)}s - ${estimate.upper.toFixed(1)}s`,
    `- Delta: ${estimate.deltaSec.toFixed(1)}s`,
    '',
  ].join('\n');
}

export function buildRetrievalSummaryMarkdown(summary?: U2RetrievalSummary): string {
  if (!summary) {
    return '# Retrieval Summary\n\nNo retrieval summary data.\n';
  }

  const symbolRows =
    summary.symbols.length > 0
      ? summary.symbols.map(
          (row) =>
            `- ${row.symbol}: ${row.pass ? 'PASS' : 'FAIL'} (steps=${row.stepCount}, duration=${formatMs(
              row.durationMs,
            )}, tokens=${typeof row.totalTokensEst === 'number' ? row.totalTokensEst : 'n/a'})`,
        )
      : ['- none'];

  const failures = summary.failures || [];
  const failureRows = failures.length > 0 ? failures.map((row) => `- ${row}`) : ['- none'];

  return [
    '# Retrieval Summary',
    '',
    '## Symbols',
    ...symbolRows,
    '',
    '## Token And Duration',
    `- Total Tokens (est): ${summary.tokenSummary?.totalTokensEst ?? 0}`,
    `- Total Duration: ${formatMs(summary.tokenSummary?.totalDurationMs)}`,
    `- UNITY_SERIALIZED_TYPE_IN Edges: ${typeof summary.serializedTypeEdgeCount === 'number' ? summary.serializedTypeEdgeCount : 'n/a'}`,
    `- CharacterList AssetRef Sprite Instances: ${summary.characterListAssetRefSprite?.spriteAssetRefInstances ?? 'n/a'}`,
    `- CharacterList AssetRef Sprite Ratio: ${
      typeof summary.characterListAssetRefSprite?.spriteRatioInNonEmpty === 'number'
        ? `${(summary.characterListAssetRefSprite.spriteRatioInNonEmpty * 100).toFixed(2)}%`
        : 'n/a'
    }`,
    '',
    '## Failures',
    ...failureRows,
    '',
  ].join('\n');
}

export function buildFinalVerdictMarkdown(input: FinalVerdictInput): string {
  const summary = input.retrievalSummary;
  const failures = [...(input.failures || []), ...((summary?.failures || []))].filter((failure, index, all) =>
    all.indexOf(failure) === index,
  );

  return [
    '# U2 E2E Final Verdict',
    '',
    `- Run ID: ${input.runId}`,
    '',
    '## Build Timings',
    `- Build: ${formatMs(input.buildTimings?.buildMs)}`,
    `- Pipeline Profile: ${formatMs(input.buildTimings?.pipelineProfileMs)}`,
    `- Analyze: ${formatSec(input.buildTimings?.analyzeSec)}`,
    '',
    '## Estimate Comparison',
    ...(input.estimateComparison
      ? [
          `- Status: ${input.estimateComparison.status}`,
          `- In Range: ${input.estimateComparison.inRange ? 'YES' : 'NO'}`,
          `- Actual: ${input.estimateComparison.actualSec.toFixed(1)}s`,
          `- Expected: ${input.estimateComparison.lower.toFixed(1)}s - ${input.estimateComparison.upper.toFixed(1)}s`,
          `- Delta: ${input.estimateComparison.deltaSec.toFixed(1)}s`,
        ]
      : ['- no estimate data']),
    '',
    '## U2 Capability Checks by Symbol',
    ...(summary?.symbols?.length
      ? summary.symbols.map(
          (row) =>
            `- ${row.symbol}: ${row.pass ? 'PASS' : 'FAIL'} (steps=${row.stepCount}, duration=${formatMs(
              row.durationMs,
            )}, tokens=${typeof row.totalTokensEst === 'number' ? row.totalTokensEst : 'n/a'})`,
        )
      : ['- none']),
    '',
    '## Token Consumption Summary',
    `- Total Tokens (est): ${summary?.tokenSummary?.totalTokensEst ?? 0}`,
    `- Total Duration: ${formatMs(summary?.tokenSummary?.totalDurationMs)}`,
    `- UNITY_SERIALIZED_TYPE_IN Edges: ${typeof summary?.serializedTypeEdgeCount === 'number' ? summary.serializedTypeEdgeCount : 'n/a'}`,
    `- CharacterList AssetRef Sprite Instances: ${summary?.characterListAssetRefSprite?.spriteAssetRefInstances ?? 'n/a'}`,
    `- CharacterList AssetRef Sprite Ratio: ${
      typeof summary?.characterListAssetRefSprite?.spriteRatioInNonEmpty === 'number'
        ? `${(summary.characterListAssetRefSprite.spriteRatioInNonEmpty * 100).toFixed(2)}%`
        : 'n/a'
    }`,
    '',
    '## Failures and Manual Actions',
    ...(failures.length > 0 ? failures.map((f) => `- ${f}`) : ['- none']),
    '',
  ].join('\n');
}

async function writeJson(reportDir: string, fileName: string, payload: unknown): Promise<void> {
  await fs.writeFile(path.join(reportDir, fileName), JSON.stringify(payload, null, 2), 'utf-8');
}

export async function writeU2E2EReports(reportDir: string, input: E2EReportWriteInput): Promise<void> {
  await fs.mkdir(reportDir, { recursive: true });

  if (input.preflight !== undefined) {
    await writeJson(reportDir, 'preflight.json', input.preflight);
  }
  if (input.scopeCounts !== undefined) {
    await writeJson(reportDir, 'scope-counts.json', input.scopeCounts);
  }
  if (input.pipelineProfile !== undefined) {
    await writeJson(reportDir, 'pipeline-profile.json', input.pipelineProfile);
  }
  if (input.analyzeSummary !== undefined) {
    await writeJson(reportDir, 'analyze-summary.json', input.analyzeSummary);
  }
  if (input.estimateComparison !== undefined) {
    await writeJson(reportDir, 'estimate-comparison.json', input.estimateComparison);
    await fs.writeFile(
      path.join(reportDir, 'estimate-comparison.md'),
      buildEstimateComparisonMarkdown(input.estimateComparison),
      'utf-8',
    );
  }
  if (input.retrievalSteps !== undefined) {
    const jsonl = input.retrievalSteps.map((row) => JSON.stringify(row)).join('\n');
    await fs.writeFile(path.join(reportDir, 'retrieval-steps.jsonl'), `${jsonl}${jsonl ? '\n' : ''}`, 'utf-8');
  }
  if (input.retrievalSummary !== undefined) {
    await writeJson(reportDir, 'retrieval-summary.json', input.retrievalSummary);
    await fs.writeFile(
      path.join(reportDir, 'retrieval-summary.md'),
      buildRetrievalSummaryMarkdown(input.retrievalSummary),
      'utf-8',
    );
  }

  await fs.writeFile(
    path.join(reportDir, 'final-verdict.md'),
    buildFinalVerdictMarkdown(input.finalVerdict),
    'utf-8',
  );
}
