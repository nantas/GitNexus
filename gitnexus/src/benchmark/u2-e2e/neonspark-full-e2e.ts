import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadE2EConfig } from './config.js';
import { parseAnalyzeSummary, compareEstimate, type AnalyzeSummary, type EstimateVerdict } from './analyze-parser.js';
import { runSymbolScenario, type SymbolScenarioResult } from './retrieval-runner.js';
import { summarizeDurations } from './metrics.js';
import { writeU2E2EReports, type U2RetrievalSummary } from './report.js';
import { summarizeCharacterListAssetRefSprite } from './characterlist-assetref.js';
import { createAgentContextToolRunner } from '../agent-context/tool-runner.js';

export type E2EGateName =
  | 'preflight'
  | 'build'
  | 'pipeline-profile'
  | 'analyze'
  | 'estimate-compare'
  | 'retrieval'
  | 'final-report';

export interface E2ERunFailure {
  status: 'failed';
  runId: string;
  reportDir: string;
  completedGates: E2EGateName[];
  failedGate: E2EGateName;
  error: string;
  gateOutputs: Partial<Record<E2EGateName, unknown>>;
}

export interface E2ERunSuccess {
  status: 'passed';
  runId: string;
  reportDir: string;
  completedGates: E2EGateName[];
  gateOutputs: Partial<Record<E2EGateName, unknown>>;
}

export type E2ERunResult = E2ERunFailure | E2ERunSuccess;

export interface RunE2EOptions {
  runId?: string;
  reportDir?: string;
  gates?: Partial<Record<E2EGateName, () => Promise<unknown>>>;
  writeCheckpoint?: (reportDir: string, payload: Record<string, unknown>) => Promise<void>;
}

export interface RunNeonsparkU2E2EOptions {
  configPath: string;
  reportDir?: string;
  runId?: string;
}

interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

interface U2E2EState {
  repoRoot: string;
  gitnexusRoot: string;
  runId: string;
  reportDir: string;
  repoAlias: string;
  configPath: string;
  config: Awaited<ReturnType<typeof loadE2EConfig>>;
  preflight?: Record<string, unknown>;
  buildMs?: number;
  pipelineProfile?: Record<string, unknown>;
  analyzeSummary?: AnalyzeSummary;
  estimateComparison?: EstimateVerdict;
  retrievalResults?: SymbolScenarioResult[];
  retrievalSummary?: U2RetrievalSummary;
}

const GATE_ORDER: E2EGateName[] = [
  'preflight',
  'build',
  'pipeline-profile',
  'analyze',
  'estimate-compare',
  'retrieval',
  'final-report',
];

function nowStamp(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

export function createRunId(prefix = 'neonspark-u2-e2e'): string {
  return `${prefix}-${nowStamp()}`;
}

async function defaultWriteCheckpoint(reportDir: string, payload: Record<string, unknown>): Promise<void> {
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(
    path.join(reportDir, 'checkpoint.json'),
    JSON.stringify(payload, null, 2),
    'utf-8',
  );
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRepoRoot(cwd: string): Promise<string> {
  if (await pathExists(path.join(cwd, 'benchmarks')) && await pathExists(path.join(cwd, 'gitnexus'))) {
    return cwd;
  }
  const parent = path.resolve(cwd, '..');
  if (await pathExists(path.join(parent, 'benchmarks')) && await pathExists(path.join(parent, 'gitnexus'))) {
    return parent;
  }
  throw new Error(`Unable to resolve repo root from cwd=${cwd}`);
}

function sanitizeAlias(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120);
}

async function execCommand(command: string, args: string[], cwd: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(command, args, { cwd, env: process.env });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (buf) => {
      stdout += buf.toString();
    });
    child.stderr.on('data', (buf) => {
      stderr += buf.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr,
        durationMs: Date.now() - started,
      });
    });
  });
}

function scopePrefixArgs(prefixes: string[]): string[] {
  const out: string[] = [];
  for (const prefix of prefixes) {
    out.push('--scope-prefix', prefix);
  }
  return out;
}

async function runRequiredCommand(command: string, args: string[], cwd: string): Promise<ExecResult> {
  const result = await execCommand(command, args, cwd);
  if (result.code !== 0) {
    const msg = `Command failed (${result.code}): ${command} ${args.join(' ')}\n${result.stderr || result.stdout}`;
    throw new Error(msg.trim());
  }
  return result;
}

function summarizeRetrieval(results: SymbolScenarioResult[]): U2RetrievalSummary {
  const symbols = results.map((result) => {
    const durationMs = result.steps.reduce((sum, step) => sum + step.durationMs, 0);
    const totalTokensEst = result.steps.reduce((sum, step) => sum + step.totalTokensEst, 0);
    return {
      symbol: result.symbol,
      pass: result.assertions.pass,
      stepCount: result.steps.length,
      durationMs: Number(durationMs.toFixed(1)),
      totalTokensEst,
      failures: result.assertions.failures,
    };
  });

  const allSteps = results.flatMap((result) => result.steps);
  const totalTokensEst = allSteps.reduce((sum, step) => sum + step.totalTokensEst, 0);
  const durationSeries = allSteps.map((step) => step.durationMs);
  const durationStats = summarizeDurations(durationSeries);
  const totalDurationMs = allSteps.reduce((sum, step) => sum + step.durationMs, 0);

  const failures = symbols.flatMap((row) => (row.failures || []).map((item) => `${row.symbol}: ${item}`));

  return {
    symbols,
    tokenSummary: {
      totalTokensEst,
      totalDurationMs: Number(totalDurationMs.toFixed(1)),
    },
    failures: [
      ...failures,
      `duration.min=${durationStats.minMs}ms median=${durationStats.medianMs}ms max=${durationStats.maxMs}ms`,
    ],
  };
}

function extractPipelineMeanMs(profile: Record<string, unknown> | undefined): number {
  if (!profile) return 0;
  const metrics = profile.metrics as Record<string, unknown> | undefined;
  const pipelineTotalMs = metrics?.pipelineTotalMs as Record<string, unknown> | undefined;
  const mean = pipelineTotalMs?.mean;
  return typeof mean === 'number' && Number.isFinite(mean) ? mean : 0;
}

function parseNumericCount(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    const cleaned = raw.trim().replace(/,/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function extractSingleCountFromCypherResult(result: unknown): number | null {
  if (Array.isArray(result) && result.length > 0) {
    const first = result[0] as any;
    if (first && typeof first === 'object') {
      return (
        parseNumericCount(first.serializedTypeEdgeCount)
        ?? parseNumericCount(first.c)
        ?? parseNumericCount(first.count)
        ?? null
      );
    }
  }

  if (!result || typeof result !== 'object') {
    return null;
  }

  const row = result as Record<string, unknown>;
  const direct =
    parseNumericCount(row.serializedTypeEdgeCount)
    ?? parseNumericCount(row.c)
    ?? parseNumericCount(row.count);
  if (direct !== null) {
    return direct;
  }

  const markdown = row.markdown;
  if (typeof markdown === 'string' && markdown.trim().length > 0) {
    const lines = markdown
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (let index = 2; index < lines.length; index += 1) {
      const cells = lines[index]
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);
      for (const cell of cells) {
        const parsed = parseNumericCount(cell);
        if (parsed !== null) {
          return parsed;
        }
      }
    }
  }

  return null;
}

async function loadSerializedTypeEdgeCount(
  runner: { cypher: (params: Record<string, unknown>) => Promise<any> },
  repoAlias: string,
): Promise<number> {
  const result = await runner.cypher({
    repo: repoAlias,
    query: "MATCH ()-[r:CodeRelation]->() WHERE r.type='UNITY_SERIALIZED_TYPE_IN' RETURN COUNT(r) AS serializedTypeEdgeCount",
  });
  const count = extractSingleCountFromCypherResult(result);
  if (count === null) {
    throw new Error('Unable to parse UNITY_SERIALIZED_TYPE_IN edge count from cypher result');
  }
  return count;
}

function selectClassUid(contextOutput: any, expectedSymbol: string): string | null {
  const candidates = Array.isArray(contextOutput?.candidates) ? contextOutput.candidates : [];
  const expectedLower = expectedSymbol.toLowerCase();
  for (const candidate of candidates) {
    const kind = String(candidate?.kind || '').toLowerCase();
    if (kind !== 'class') continue;
    const name = String(candidate?.name || '').toLowerCase();
    if (name !== expectedLower) continue;
    const uid = String(candidate?.uid || '').trim();
    if (uid) return uid;
  }
  return null;
}

async function loadCharacterListContext(
  runner: { context: (params: Record<string, unknown>) => Promise<any> },
  repoAlias: string,
): Promise<any> {
  const input = { name: 'CharacterList', repo: repoAlias, unity_resources: 'on' };
  const first = await runner.context(input);
  if (first?.status !== 'ambiguous') {
    return first;
  }

  const classUid = selectClassUid(first, 'CharacterList');
  if (!classUid) {
    return first;
  }
  return runner.context({ ...input, uid: classUid });
}

export async function runNeonsparkU2E2E(options: RunNeonsparkU2E2EOptions): Promise<E2ERunResult> {
  const cwd = process.cwd();
  const repoRoot = await resolveRepoRoot(cwd);
  const gitnexusRoot = path.join(repoRoot, 'gitnexus');
  const config = await loadE2EConfig(options.configPath);
  const runId = options.runId || createRunId(config.runIdPrefix || 'neonspark-u2-e2e');
  const reportDir = path.resolve(options.reportDir || path.join(repoRoot, 'docs/reports', runId));
  const repoAlias = sanitizeAlias(`${config.repoAliasPrefix}-${runId}`);

  const state: U2E2EState = {
    repoRoot,
    gitnexusRoot,
    runId,
    reportDir,
    repoAlias,
    configPath: path.resolve(options.configPath),
    config,
  };

  return runE2E({
    runId,
    reportDir,
    gates: {
      preflight: async () => {
        if (!(await pathExists(config.targetPath))) {
          throw new Error(`Target path not found: ${config.targetPath}`);
        }
        if (!(await pathExists('/usr/bin/time'))) {
          throw new Error('Missing required tool: /usr/bin/time');
        }
        state.preflight = {
          targetPath: config.targetPath,
          configPath: state.configPath,
          repoAlias,
          scenarioCount: config.symbolScenarios.length,
        };
        return state.preflight;
      },
      build: async () => {
        const build = await runRequiredCommand('npm', ['--prefix', 'gitnexus', 'run', 'build'], repoRoot);
        state.buildMs = Number(build.durationMs.toFixed(1));
        return { durationMs: state.buildMs };
      },
      'pipeline-profile': async () => {
        const reportPath = path.join(reportDir, 'pipeline-profile.json');
        const scopeArgs = scopePrefixArgs(config.scope.scriptPrefixes || []);
        await runRequiredCommand(
          'npm',
          [
            '--prefix',
            'gitnexus',
            'run',
            'benchmark:u2:sample',
            '--',
            '--target-path',
            config.targetPath,
            '--runs',
            '1',
            '--report',
            reportPath,
            ...scopeArgs,
          ],
          repoRoot,
        );
        const raw = await fs.readFile(reportPath, 'utf-8');
        state.pipelineProfile = JSON.parse(raw) as Record<string, unknown>;
        return state.pipelineProfile;
      },
      analyze: async () => {
        const scopeArgs = scopePrefixArgs(config.scope.scriptPrefixes || []);
        const analyze = await runRequiredCommand(
          '/usr/bin/time',
          [
            '-p',
            'node',
            'dist/cli/index.js',
            'analyze',
            '--force',
            '--extensions',
            '.cs',
            '--repo-alias',
            repoAlias,
            ...scopeArgs,
            config.targetPath,
          ],
          gitnexusRoot,
        );
        const logPath = path.join(reportDir, 'analyze.log');
        await fs.writeFile(logPath, `${analyze.stdout}\n${analyze.stderr}\n`, 'utf-8');
        state.analyzeSummary = await parseAnalyzeSummary(logPath);
        return state.analyzeSummary;
      },
      'estimate-compare': async () => {
        if (!state.analyzeSummary) {
          throw new Error('analyze summary missing');
        }
        state.estimateComparison = compareEstimate(state.analyzeSummary.totalSec, config.estimateRangeSec);
        return state.estimateComparison;
      },
      retrieval: async () => {
        const runner = await createAgentContextToolRunner();
        try {
          const results: SymbolScenarioResult[] = [];
          for (const scenario of config.symbolScenarios) {
            results.push(await runSymbolScenario(runner, scenario, repoAlias));
          }

          const serializedTypeEdgeCount = await loadSerializedTypeEdgeCount(runner, repoAlias);
          if (serializedTypeEdgeCount <= 0) {
            throw new Error('U3 gate failed: UNITY_SERIALIZED_TYPE_IN edge count must be > 0');
          }

          const characterListContext = await loadCharacterListContext(runner, repoAlias);
          const characterBindings = Array.isArray(characterListContext?.resourceBindings)
            ? characterListContext.resourceBindings
            : [];
          const characterListAssetRefSprite = summarizeCharacterListAssetRefSprite(characterBindings);
          if (characterListAssetRefSprite.spriteAssetRefInstances <= 0) {
            throw new Error('U3 gate failed: CharacterList AssetRef sprite instances must be > 0');
          }

          state.retrievalResults = results;
          state.retrievalSummary = {
            ...summarizeRetrieval(results),
            serializedTypeEdgeCount,
            characterListAssetRefSprite: {
              extractedAssetRefInstances: characterListAssetRefSprite.extractedAssetRefInstances,
              nonEmptyAssetRefInstances: characterListAssetRefSprite.nonEmptyAssetRefInstances,
              spriteAssetRefInstances: characterListAssetRefSprite.spriteAssetRefInstances,
              spriteRatioInNonEmpty: characterListAssetRefSprite.spriteRatioInNonEmpty,
              uniqueSpriteAssets: characterListAssetRefSprite.uniqueSpriteAssets,
            },
          };
          return state.retrievalSummary;
        } finally {
          await runner.close();
        }
      },
      'final-report': async () => {
        await writeU2E2EReports(reportDir, {
          preflight: state.preflight,
          scopeCounts: {
            scriptPrefixCount: config.scope.scriptPrefixes.length,
            resourcePrefixCount: config.scope.resourcePrefixes.length,
          },
          pipelineProfile: state.pipelineProfile,
          analyzeSummary: state.analyzeSummary,
          estimateComparison: state.estimateComparison,
          retrievalSteps:
            state.retrievalResults?.flatMap((scenario) =>
              scenario.steps.map((step) => ({
                symbol: scenario.symbol,
                ...step,
              })),
            ) || [],
          retrievalSummary: state.retrievalSummary,
          finalVerdict: {
            runId,
            buildTimings: {
              buildMs: state.buildMs,
              pipelineProfileMs: extractPipelineMeanMs(state.pipelineProfile),
              analyzeSec: state.analyzeSummary?.totalSec,
            },
            estimateComparison: state.estimateComparison,
            retrievalSummary: state.retrievalSummary,
            failures: state.retrievalSummary?.failures || [],
          },
        });
        return {
          reportDir,
          runId,
        };
      },
    },
  });
}

export async function runE2E(options: RunE2EOptions = {}): Promise<E2ERunResult> {
  const runId = options.runId || createRunId();
  const reportDir = options.reportDir || path.resolve('.gitnexus/u2-e2e', runId);
  const writeCheckpoint = options.writeCheckpoint || defaultWriteCheckpoint;
  const gates = options.gates || {};

  await fs.mkdir(reportDir, { recursive: true });

  const completedGates: E2EGateName[] = [];
  const gateOutputs: Partial<Record<E2EGateName, unknown>> = {};

  for (const gate of GATE_ORDER) {
    const gateRunner = gates[gate];
    if (!gateRunner) {
      completedGates.push(gate);
      continue;
    }

    try {
      gateOutputs[gate] = await gateRunner();
      completedGates.push(gate);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const checkpointPayload = {
        runId,
        status: 'failed',
        failedGate: gate,
        completedGates,
        error: message,
        capturedAt: new Date().toISOString(),
      };
      await writeCheckpoint(reportDir, checkpointPayload);

      return {
        status: 'failed',
        runId,
        reportDir,
        completedGates,
        failedGate: gate,
        error: message,
        gateOutputs,
      };
    }
  }

  return {
    status: 'passed',
    runId,
    reportDir,
    completedGates,
    gateOutputs,
  };
}
