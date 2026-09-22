import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_GITNEXUS_PACKAGE_NAME = '@veewo/gitnexus';
export const DEFAULT_GITNEXUS_DIST_TAG = 'latest';
export const CLI_SPEC_ENV_KEY = 'GITNEXUS_CLI_SPEC';
export const CLI_VERSION_ENV_KEY = 'GITNEXUS_CLI_VERSION';

type CliSpecSource =
  | 'explicit-spec'
  | 'explicit-version'
  | 'env-spec'
  | 'env-version'
  | 'config-spec'
  | 'config-version'
  | 'default';

export interface CliSpecConfigLike {
  cliPackageSpec?: string;
  cliVersion?: string;
}

export interface ResolveCliSpecInput {
  packageName?: string;
  explicitSpec?: string;
  explicitVersion?: string;
  config?: CliSpecConfigLike;
  env?: NodeJS.ProcessEnv;
  defaultDistTag?: string;
}

export interface ResolvedCliSpec {
  packageName: string;
  packageSpec: string;
  source: CliSpecSource;
}

let cachedPackageName: string | null = null;

/**
 * Resolve package name from package.json with fallback for unusual runtimes.
 */
export function resolveGitNexusPackageName(): string {
  if (cachedPackageName) return cachedPackageName;
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
    const raw = readFileSync(packageJsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as { name?: string };
    const trimmed = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    cachedPackageName = trimmed || DEFAULT_GITNEXUS_PACKAGE_NAME;
  } catch {
    cachedPackageName = DEFAULT_GITNEXUS_PACKAGE_NAME;
  }
  return cachedPackageName;
}

function hasPinnedVersion(packageSpec: string): boolean {
  const trimmed = packageSpec.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('@')) {
    return trimmed.indexOf('@', 1) !== -1;
  }
  return trimmed.includes('@');
}

function looksLikePackageSpec(token: string): boolean {
  if (!token) return false;
  if (token.startsWith('@')) return true;
  if (token.includes('/')) return true;
  return token.includes('@');
}

function normalizePackageSpec(packageName: string, raw: string, defaultDistTag: string): string {
  const token = raw.trim();
  if (!token) return `${packageName}@${defaultDistTag}`;
  if (looksLikePackageSpec(token)) {
    return hasPinnedVersion(token) ? token : `${token}@${defaultDistTag}`;
  }
  return `${packageName}@${token}`;
}

export function resolveCliSpec(input: ResolveCliSpecInput = {}): ResolvedCliSpec {
  const packageName =
    (input.packageName || resolveGitNexusPackageName()).trim() || DEFAULT_GITNEXUS_PACKAGE_NAME;
  const env = input.env || process.env;
  const config = input.config || {};
  const defaultDistTag =
    (input.defaultDistTag || DEFAULT_GITNEXUS_DIST_TAG).trim() || DEFAULT_GITNEXUS_DIST_TAG;

  const candidates: Array<{ value?: string; source: CliSpecSource }> = [
    { value: input.explicitSpec, source: 'explicit-spec' },
    { value: input.explicitVersion, source: 'explicit-version' },
    { value: env[CLI_SPEC_ENV_KEY], source: 'env-spec' },
    { value: env[CLI_VERSION_ENV_KEY], source: 'env-version' },
    { value: config.cliPackageSpec, source: 'config-spec' },
    { value: config.cliVersion, source: 'config-version' },
  ];

  for (const candidate of candidates) {
    const trimmed = (candidate.value || '').trim();
    if (!trimmed) continue;
    return {
      packageName,
      packageSpec: normalizePackageSpec(packageName, trimmed, defaultDistTag),
      source: candidate.source,
    };
  }

  return {
    packageName,
    packageSpec: `${packageName}@${defaultDistTag}`,
    source: 'default',
  };
}

export function buildNpxCommand(packageSpec: string, subcommand: string): string {
  return `npx -y ${packageSpec} ${subcommand}`.trim();
}
