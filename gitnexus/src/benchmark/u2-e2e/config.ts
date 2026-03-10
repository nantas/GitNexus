import fs from 'node:fs/promises';
import path from 'node:path';

export interface E2EConfig {
  runIdPrefix: string;
  targetPath: string;
  repoAliasPrefix: string;
  scope: { scriptPrefixes: string[]; resourcePrefixes: string[] };
  estimateRangeSec: { lower: number; upper: number };
  symbolScenarios: SymbolScenario[];
}

export interface SymbolScenario {
  symbol: string;
  kind: 'component' | 'scriptableobject' | 'serializable-class' | 'partial-component';
  objectives: string[];
  contextFileHint?: string;
  deepDivePlan: Array<{ tool: 'query' | 'context' | 'impact' | 'cypher'; input: Record<string, unknown> }>;
}

interface RawE2EConfig {
  runIdPrefix: string;
  targetPath: string;
  repoAliasPrefix: string;
  scope: { scriptPrefixes: string[]; resourcePrefixes: string[] };
  estimateRangeSec: { lower: number; upper: number };
  symbolScenariosPath?: string;
  symbolScenarios?: SymbolScenario[];
}

interface E2EEnvOverrides {
  runIdPrefix?: string;
  targetPath?: string;
  repoAliasPrefix?: string;
  symbolScenariosPath?: string;
  estimateLowerSec?: number;
  estimateUpperSec?: number;
}

function candidatePaths(inputPath: string): string[] {
  if (path.isAbsolute(inputPath)) {
    return [inputPath];
  }

  return [
    path.resolve(process.cwd(), inputPath),
    path.resolve(process.cwd(), '..', inputPath),
  ];
}

async function readJsonFile<T>(inputPath: string): Promise<T> {
  const tried: string[] = [];
  for (const filePath of candidatePaths(inputPath)) {
    tried.push(filePath);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  throw new Error(`File not found: ${inputPath}. Tried: ${tried.join(', ')}`);
}

function parseEnvNumber(raw: string | undefined, envName: string): number | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${envName} must be a finite number, got "${raw}"`);
  }
  return parsed;
}

function loadEnvOverrides(env: NodeJS.ProcessEnv): E2EEnvOverrides {
  const runIdPrefix = env.GITNEXUS_U2_E2E_RUN_ID_PREFIX?.trim();
  const targetPath = env.GITNEXUS_U2_E2E_TARGET_PATH?.trim();
  const repoAliasPrefix = env.GITNEXUS_U2_E2E_REPO_ALIAS_PREFIX?.trim();
  const symbolScenariosPath = env.GITNEXUS_U2_E2E_SYMBOL_SCENARIOS_PATH?.trim();
  const estimateLowerSec = parseEnvNumber(
    env.GITNEXUS_U2_E2E_ESTIMATE_LOWER_SEC,
    'GITNEXUS_U2_E2E_ESTIMATE_LOWER_SEC',
  );
  const estimateUpperSec = parseEnvNumber(
    env.GITNEXUS_U2_E2E_ESTIMATE_UPPER_SEC,
    'GITNEXUS_U2_E2E_ESTIMATE_UPPER_SEC',
  );

  const hasLower = estimateLowerSec !== undefined;
  const hasUpper = estimateUpperSec !== undefined;
  if (hasLower !== hasUpper) {
    throw new Error(
      'GITNEXUS_U2_E2E_ESTIMATE_LOWER_SEC and GITNEXUS_U2_E2E_ESTIMATE_UPPER_SEC must be set together',
    );
  }

  return {
    ...(runIdPrefix ? { runIdPrefix } : {}),
    ...(targetPath ? { targetPath } : {}),
    ...(repoAliasPrefix ? { repoAliasPrefix } : {}),
    ...(symbolScenariosPath ? { symbolScenariosPath } : {}),
    ...(hasLower && hasUpper
      ? {
          estimateLowerSec: estimateLowerSec as number,
          estimateUpperSec: estimateUpperSec as number,
        }
      : {}),
  };
}

export async function loadE2EConfig(
  configPath: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<E2EConfig> {
  const raw = await readJsonFile<RawE2EConfig>(configPath);
  const overrides = loadEnvOverrides(env);

  const symbolScenariosPath = overrides.symbolScenariosPath || raw.symbolScenariosPath;
  let symbolScenarios = raw.symbolScenarios || [];
  if (symbolScenariosPath) {
    symbolScenarios = await readJsonFile<SymbolScenario[]>(symbolScenariosPath);
  }

  return {
    runIdPrefix: overrides.runIdPrefix || raw.runIdPrefix,
    targetPath: overrides.targetPath || raw.targetPath,
    repoAliasPrefix: overrides.repoAliasPrefix || raw.repoAliasPrefix,
    scope: raw.scope,
    estimateRangeSec:
      overrides.estimateLowerSec !== undefined && overrides.estimateUpperSec !== undefined
        ? {
            lower: overrides.estimateLowerSec,
            upper: overrides.estimateUpperSec,
          }
        : raw.estimateRangeSec,
    symbolScenarios,
  };
}
