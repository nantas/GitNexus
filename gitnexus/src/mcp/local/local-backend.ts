/**
 * Local Backend (Multi-Repo)
 *
 * Provides tool implementations using local .gitnexus/ indexes.
 * Supports multiple indexed repositories via a global registry.
 * LadybugDB connections are opened lazily per repo on first query.
 */

import fs from 'fs/promises';
import path from 'path';
import { initLbug, executeQuery, executeParameterized, closeLbug, isLbugReady } from '../core/lbug-adapter.js';
import { parseHydrationPolicy, parseUnityEvidenceMode, parseUnityHydrationMode, parseUnityResourcesMode } from '../../core/unity/options.js';
import { buildAssetMetaIndex } from '../../core/unity/meta-index.js';
import type { ResolvedUnityBinding } from '../../core/unity/resolver.js';
import type { UnityUiTraceGoal, UnityUiSelectorMode } from '../../core/unity/ui-trace.js';
import { runUnityUiTrace } from '../../core/unity/ui-trace.js';
import { loadUnityContext, type UnityContextPayload, type UnityHydrationMeta } from './unity-enrichment.js';
import { buildMissingEvidenceFromHydrationMeta, hydrateUnityForSymbol } from './unity-runtime-hydration.js';
import { buildUnityEvidenceView } from './unity-evidence-view.js';
import {
  buildSlimContextResult,
  buildSlimQueryResult,
  resolveResponseProfile,
} from './agent-safe-response.js';
import { deriveEvidenceFingerprint, mergeProcessEvidence } from './process-evidence.js';
import { buildProcessRef, type ProcessRefOrigin } from './process-ref.js';
import type { ProcessConfidence, ProcessEvidenceMode, VerificationHint } from './process-confidence.js';
import type { RuntimeChainEvidenceLevel } from './runtime-chain-evidence.js';
import {
  verifyRuntimeClaimOnDemand,
  type RuntimeChainVerifyMode,
} from './runtime-chain-verify.js';
import { adjustRuntimeClaimForPolicy } from './runtime-claim.js';
// Embedding imports are lazy (dynamic import) to avoid loading onnxruntime-node
// at MCP server startup — crashes on unsupported Node ABI versions (#89)
// git utilities available if needed
// import { isGitRepo, getCurrentCommit, getGitRoot } from '../../storage/git.js';
import { parseDiffHunks, type FileDiff } from '../../storage/git.js';
import {
  listRegisteredRepos,
  cleanupOldKuzuFiles,
  type RegistryEntry,
} from '../../storage/repo-manager.js';
import { analyzeRuleLabSlice } from '../../rule-lab/analyze.js';
import { buildReviewPack } from '../../rule-lab/review-pack.js';
import { curateRuleLabSlice } from '../../rule-lab/curate.js';
import { promoteCuratedRules } from '../../rule-lab/promote.js';
import { runRuleLabRegress } from '../../rule-lab/regress.js';
import { loadCompiledRuleBundle } from '../../rule-lab/compiled-bundles.js';
// AI context generation is CLI-only (gitnexus analyze)
// import { generateAIContextFiles } from '../../cli/ai-context.js';

/**
 * Quick test-file detection for filtering impact results.
 * Matches common test file patterns across all supported languages.
 */
export function isTestFilePath(filePath: string): boolean {
  const p = filePath.toLowerCase().replace(/\\/g, '/');
  return (
    p.includes('.test.') ||
    p.includes('.spec.') ||
    p.includes('__tests__/') ||
    p.includes('__mocks__/') ||
    p.includes('/test/') ||
    p.includes('/tests/') ||
    p.includes('/testing/') ||
    p.includes('/fixtures/') ||
    p.endsWith('_test.go') ||
    p.endsWith('_test.py') ||
    p.endsWith('_spec.rb') ||
    p.endsWith('_test.rb') ||
    p.includes('/spec/') ||
    p.includes('/test_') ||
    p.includes('/conftest.')
  );
}

function normalizePath(filePath: string): string {
  return String(filePath || '').replace(/\\/g, '/');
}

function isUnityResourcePathLike(value: string): boolean {
  return /\.(asset|prefab|meta)$/i.test(String(value || '').trim());
}

type QueryScopePreset = 'unity-gameplay' | 'unity-all';
type UnityHydrationModeOption = 'compact' | 'parity';
type HydrationPolicyOption = 'fast' | 'balanced' | 'strict';
type ResourceSeedMode = 'strict' | 'balanced';

const UNITY_GAMEPLAY_INCLUDE_PREFIXES = ['assets/'];
const UNITY_GAMEPLAY_EXCLUDE_PREFIXES = [
  'assets/plugins/',
  'packages/',
  'library/',
  'projectsettings/',
  'usersettings/',
  'temp/',
];
const UNITY_PLUGIN_INTENT_TOKENS = new Set(['plugin', 'plugins', 'fmod', 'steam', 'crash', 'sdk', 'package']);
const QUERY_STOP_WORDS = new Set([
  'the', 'and', 'for', 'from', 'with', 'that', 'this', 'into',
  'using', 'use', 'in', 'on', 'of', 'to', 'a', 'an',
]);

function resolveHydrationModeDecision(input: {
  hydrationPolicy: HydrationPolicyOption;
  unityHydrationMode: UnityHydrationModeOption;
}): { requestedMode: UnityHydrationModeOption; reason: string } {
  const { hydrationPolicy, unityHydrationMode } = input;
  if (hydrationPolicy === 'strict') {
    return {
      requestedMode: 'parity',
      reason: unityHydrationMode === 'parity'
        ? 'hydration_policy_strict'
        : 'hydration_policy_strict_overrides_unity_hydration_mode',
    };
  }
  if (hydrationPolicy === 'fast') {
    return {
      requestedMode: 'compact',
      reason: unityHydrationMode === 'compact'
        ? 'hydration_policy_fast'
        : 'hydration_policy_fast_overrides_unity_hydration_mode',
    };
  }
  return {
    requestedMode: unityHydrationMode,
    reason: unityHydrationMode === 'parity'
      ? 'hydration_policy_balanced_respects_unity_hydration_mode'
      : 'hydration_policy_balanced_default_compact',
  };
}

function withHydrationDecisionMeta(input: {
  payload: UnityContextPayload;
  requestedMode: UnityHydrationModeOption;
  reason: string;
}): UnityContextPayload {
  if (!input.payload.hydrationMeta) {
    return input.payload;
  }
  return {
    ...input.payload,
    hydrationMeta: {
      ...input.payload.hydrationMeta,
      requestedMode: input.requestedMode,
      reason: input.reason,
    } as UnityHydrationMeta,
  };
}

export interface ExpandedSymbolCandidate {
  id: string;
  name: string;
  type: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
}

function tokenizeQuery(query: string): string[] {
  const normalized = String(query || '').toLowerCase();
  return normalized
    .split(/[^a-z0-9_]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !QUERY_STOP_WORDS.has(token));
}

function matchesAnyPrefix(pathLower: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathLower.startsWith(prefix));
}

function isUnityPluginPath(filePath: string): boolean {
  const p = normalizePath(filePath).toLowerCase();
  return p.startsWith('assets/plugins/') || p.startsWith('packages/') || p.startsWith('library/packagecache/');
}

function isUnityGameplayPath(filePath: string): boolean {
  const p = normalizePath(filePath).toLowerCase();
  return p.startsWith('assets/') && !isUnityPluginPath(p);
}

function resolveQueryScopePreset(scopePreset?: string): QueryScopePreset | undefined {
  if (!scopePreset) return undefined;
  const normalized = String(scopePreset).trim().toLowerCase();
  if (normalized === 'unity-gameplay' || normalized === 'unity-all') {
    return normalized as QueryScopePreset;
  }
  return undefined;
}

function aggregateProcessConfidence(rows: Array<{ process_confidence?: ProcessConfidence }>): ProcessConfidence {
  if (rows.some((row) => row.process_confidence === 'high')) return 'high';
  if (rows.some((row) => row.process_confidence === 'medium')) return 'medium';
  return 'low';
}

function aggregateProcessEvidenceMode(
  rows: Array<{ process_evidence_mode?: ProcessEvidenceMode }>,
): ProcessEvidenceMode {
  if (rows.some((row) => row.process_evidence_mode === 'direct_step')) return 'direct_step';
  return 'method_projected';
}

function selectVerificationHint(rows: Array<{ verification_hint?: VerificationHint }>): VerificationHint | undefined {
  return rows.find((row) => row.verification_hint)?.verification_hint;
}

export function parseResourceSeedMode(raw: unknown): ResourceSeedMode {
  const normalized = String(raw || '').trim().toLowerCase();
  if (!normalized || normalized === 'balanced') return 'balanced';
  if (normalized === 'strict') return 'strict';
  throw new Error('resource_seed_mode must be one of: strict, balanced');
}

function isUnityResourcePath(value: string): boolean {
  return /\.(asset|prefab|unity)$/i.test(value.trim());
}

export function extractUnityResourcePaths(text: string): string[] {
  const out: string[] = [];
  const re = /(Assets\/[^\s'"`]+?\.(?:asset|prefab|unity))/gi;
  let match = re.exec(String(text || ''));
  while (match) {
    const path = normalizePath(match[1] || '').trim();
    if (path && !out.includes(path)) out.push(path);
    match = re.exec(String(text || ''));
  }
  return out;
}

export function computeVerifierMinimumEvidenceSatisfied(input: {
  evidenceMetaRows: Array<{
    verifier_minimum_evidence_satisfied?: boolean;
    minimum_evidence_satisfied?: boolean;
    truncated?: boolean;
    filter_exhausted?: boolean;
  }>;
  truncated: boolean;
  filterExhausted: boolean;
}): boolean {
  if (input.truncated || input.filterExhausted) return false;
  if (!Array.isArray(input.evidenceMetaRows) || input.evidenceMetaRows.length === 0) return false;
  return input.evidenceMetaRows.every((row) => (
    row?.truncated !== true
    && row?.filter_exhausted !== true
    && row?.minimum_evidence_satisfied !== false
    && row?.verifier_minimum_evidence_satisfied !== false
  ));
}

export function resolveSeedPath(input: { queryText?: string; resourcePathPrefix?: string; filePath?: string }): string | undefined {
  const explicit = normalizePath(String(input.resourcePathPrefix || '').trim());
  if (explicit && isUnityResourcePath(explicit)) {
    return explicit;
  }
  const fromFile = normalizePath(String(input.filePath || '').trim());
  if (fromFile && isUnityResourcePath(fromFile)) {
    return fromFile;
  }
  const fromQuery = extractUnityResourcePaths(String(input.queryText || ''));
  return fromQuery[0];
}

interface NextHopPayload {
  kind: 'resource' | 'symbol' | 'process' | 'verify';
  target: string;
  why: string;
  next_command: string;
}

interface RetrievalRuleHint {
  id: string;
  next_action: string;
  host_base_type?: string[];
}

interface SeedTargetCandidate {
  targetPath: string;
  fieldName?: string;
  sourceLayer?: string;
}

interface ResourceChainTargetSymbol {
  id?: string;
  name?: string;
  filePath?: string;
  requireExact?: boolean;
}

interface UnityResourceChainPayload {
  sourceResourcePath: string;
  relationType: 'UNITY_ASSET_GUID_REF';
  intermediateResourcePath: string;
  nextRelationType: 'UNITY_GRAPH_NODE_SCRIPT_REF';
  targetSymbol: {
    uid?: string;
    name?: string;
    kind?: string;
    filePath?: string;
  };
  relationReason?: string;
  nextRelationReason?: string;
}

function pathTokens(value: string): string[] {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function parseSeedRelationReason(rawReason: unknown): Pick<SeedTargetCandidate, 'fieldName' | 'sourceLayer'> {
  const text = String(rawReason || '').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as { fieldName?: string; sourceLayer?: string };
    const fieldName = String(parsed.fieldName || '').trim();
    const sourceLayer = String(parsed.sourceLayer || '').trim();
    return {
      ...(fieldName ? { fieldName } : {}),
      ...(sourceLayer ? { sourceLayer } : {}),
    };
  } catch {
    return {};
  }
}

async function loadSeedUnityResourceChains(input: {
  repoId: string;
  seedPath?: string;
  targetSymbols?: ResourceChainTargetSymbol[];
}): Promise<UnityResourceChainPayload[]> {
  const seedPath = normalizePath(String(input.seedPath || '').trim());
  if (!seedPath) return [];

  const targetSymbols = (input.targetSymbols || [])
    .map((symbol) => ({
      id: String(symbol?.id || '').trim(),
      name: String(symbol?.name || '').trim(),
      filePath: normalizePath(String(symbol?.filePath || '').trim()),
      requireExact: Boolean(symbol?.requireExact),
    }))
    .filter((symbol) => symbol.id || symbol.name || symbol.filePath);

  let rows: any[] = [];
  try {
    rows = await executeParameterized(input.repoId, `
      MATCH (source:File {filePath: $seedPath})-[r1:CodeRelation {type: 'UNITY_ASSET_GUID_REF'}]->(intermediate:File)-[r2:CodeRelation {type: 'UNITY_GRAPH_NODE_SCRIPT_REF'}]->(target)
      RETURN source.filePath AS sourceResourcePath,
             r1.type AS relationType,
             r1.reason AS relationReason,
             intermediate.filePath AS intermediateResourcePath,
             r2.type AS nextRelationType,
             r2.reason AS nextRelationReason,
             target.id AS targetUid,
             target.name AS targetName,
             labels(target)[0] AS targetKind,
             target.filePath AS targetFilePath
      LIMIT 200
    `, { seedPath });
  } catch (e) {
    logQueryError('unity-resource-chains:seed-second-hop', e);
    return [];
  }

  const seen = new Set<string>();
  const chains = rows
    .map((row: any, index: number) => {
      const targetUid = String(row?.targetUid || row?.[6] || '').trim();
      const targetName = String(row?.targetName || row?.[7] || '').trim();
      const targetFilePath = normalizePath(String(row?.targetFilePath || row?.[9] || '').trim());
      const chain: UnityResourceChainPayload = {
        sourceResourcePath: normalizePath(String(row?.sourceResourcePath || row?.[0] || '').trim()),
        relationType: 'UNITY_ASSET_GUID_REF',
        relationReason: String(row?.relationReason || row?.[2] || '').trim() || undefined,
        intermediateResourcePath: normalizePath(String(row?.intermediateResourcePath || row?.[3] || '').trim()),
        nextRelationType: 'UNITY_GRAPH_NODE_SCRIPT_REF',
        nextRelationReason: String(row?.nextRelationReason || row?.[5] || '').trim() || undefined,
        targetSymbol: {
          ...(targetUid ? { uid: targetUid } : {}),
          ...(targetName ? { name: targetName } : {}),
          kind: String(row?.targetKind || row?.[8] || '').trim() || undefined,
          ...(targetFilePath ? { filePath: targetFilePath } : {}),
        },
      };
      return {
        chain,
        index,
        score: scoreUnityResourceChainTarget(chain, targetSymbols),
      };
    })
    .filter(({ chain, score }) => {
      if (!chain.sourceResourcePath || !chain.intermediateResourcePath || !chain.targetSymbol?.name) return false;
      if (targetSymbols.length > 0 && score <= 0) return false;
      const key = `${chain.sourceResourcePath}->${chain.intermediateResourcePath}->${chain.targetSymbol.uid || chain.targetSymbol.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, 20)
    .map((entry) => entry.chain);

  return chains;
}

function scoreUnityResourceChainTarget(
  chain: UnityResourceChainPayload,
  targetSymbols: ResourceChainTargetSymbol[],
): number {
  if (targetSymbols.length === 0) return 1;
  const activeTargetSymbols = targetSymbols.some((symbol) => symbol.requireExact)
    ? targetSymbols.filter((symbol) => symbol.requireExact)
    : targetSymbols;
  const targetUid = String(chain.targetSymbol?.uid || '').trim();
  const targetName = String(chain.targetSymbol?.name || '').trim();
  const targetFilePath = normalizePath(String(chain.targetSymbol?.filePath || '').trim());
  let best = 0;
  for (const symbol of activeTargetSymbols) {
    let score = 0;
    const exactMatched = Boolean(
      (targetUid && symbol.id && targetUid === symbol.id)
      || (targetName && symbol.name && targetName === symbol.name),
    );
    if (targetUid && symbol.id && targetUid === symbol.id) score += 100;
    if (targetFilePath && symbol.filePath && targetFilePath === symbol.filePath) score += 60;
    if (targetName && symbol.name && targetName === symbol.name) score += 30;
    if (symbol.requireExact && !exactMatched) score = 0;
    best = Math.max(best, score);
  }
  return best;
}

function exactResourceChainQuerySymbol(queryText: string): ResourceChainTargetSymbol | undefined {
  const trimmed = String(queryText || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) return undefined;
  return { name: trimmed, requireExact: true };
}

function scoreSeedTargetCandidate(seedPath: string, candidate: SeedTargetCandidate): number {
  const targetPath = normalizePath(candidate.targetPath);
  if (!targetPath) return Number.NEGATIVE_INFINITY;
  const seedBase = path.basename(normalizePath(seedPath), path.extname(seedPath)).toLowerCase();
  const targetBase = path.basename(targetPath, path.extname(targetPath)).toLowerCase();
  const seedTokens = new Set(pathTokens(seedBase));
  const targetTokens = new Set(pathTokens(targetBase));
  let overlap = 0;
  for (const token of seedTokens) {
    if (targetTokens.has(token)) overlap += 1;
  }

  const p = targetPath.toLowerCase();
  let score = 0;
  if (/\.(asset)$/i.test(p)) score += 12;
  if (/\.(prefab)$/i.test(p)) score -= 8;
  if (p.includes('/graph')) score += 30;
  if (targetBase && seedBase && (targetBase.includes(seedBase) || seedBase.includes(targetBase))) score += 18;
  score += overlap * 8;

  const fieldName = String(candidate.fieldName || '').toLowerCase();
  const fieldTokens = new Set(pathTokens(fieldName));
  for (const token of seedTokens) {
    if (fieldTokens.has(token)) score += 10;
  }
  const graphSignals = ['graph', 'node', 'loader', 'runtime'];
  for (const token of graphSignals) {
    if (fieldTokens.has(token)) score += 12;
  }
  const visualSignals = ['sprite', 'icon', 'material', 'vfx', 'fx', 'audio'];
  for (const token of visualSignals) {
    if (fieldTokens.has(token)) score -= 8;
  }

  const sourceLayer = String(candidate.sourceLayer || '').toLowerCase();
  if (sourceLayer.includes('asset')) score += 4;

  return score;
}

function rankSeedTargetCandidates(seedPath: string, candidates: SeedTargetCandidate[]): string[] {
  const deduped = new Map<string, SeedTargetCandidate>();
  for (const candidate of candidates) {
    const targetPath = normalizePath(String(candidate.targetPath || '').trim());
    if (!targetPath) continue;
    const existing = deduped.get(targetPath);
    if (!existing) {
      deduped.set(targetPath, { ...candidate, targetPath });
      continue;
    }
    if (!existing.fieldName && candidate.fieldName) existing.fieldName = candidate.fieldName;
    if (!existing.sourceLayer && candidate.sourceLayer) existing.sourceLayer = candidate.sourceLayer;
  }
  return [...deduped.values()]
    .sort((a, b) => {
      const scoreDiff = scoreSeedTargetCandidate(seedPath, b) - scoreSeedTargetCandidate(seedPath, a);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a.targetPath).localeCompare(String(b.targetPath));
    })
    .map((candidate) => candidate.targetPath);
}

export function pickVerificationTarget(input: {
  seedMode: ResourceSeedMode;
  seedPath?: string;
  mappedSeedTargets: string[];
  resourceBindings: ResolvedUnityBinding[];
  fallback: string;
}): string {
  const normalizedBindings = input.resourceBindings.map((binding) => normalizePath(String(binding.resourcePath || '').trim()));
  const bindingSet = new Set(normalizedBindings);
  const mappedInBindings = input.mappedSeedTargets.find((target) => bindingSet.has(normalizePath(target)));
  if (mappedInBindings) return mappedInBindings;
  if (input.seedMode === 'strict' && input.seedPath) {
    return normalizePath(input.seedPath);
  }
  if (input.seedMode === 'strict') {
    return input.fallback;
  }
  // Balanced mode fallback only; strict mode is handled above and never falls back to first binding.
  return normalizedBindings[0] || input.fallback;
}

export function pickVerifierSymbolAnchor(input: {
  queryText?: string;
  processSymbols: any[];
  definitions: any[];
}): { symbolName?: string; symbolFilePath?: string } {
  const rows = [
    ...input.processSymbols,
    ...input.definitions,
  ];
  const evidenceModeRank = (row: any): number => {
    const mode = String(row?.process_evidence_mode || row?.evidence_mode || '').trim().toLowerCase();
    if (mode === 'direct_step') return 3;
    if (mode === 'method_projected') return 2;
    if (mode === 'resource_heuristic') return 1;
    return 0;
  };
  const confidenceRank = (row: any): number => {
    const confidence = String(row?.process_confidence || row?.confidence || '').trim().toLowerCase();
    if (confidence === 'high') return 3;
    if (confidence === 'medium') return 2;
    if (confidence === 'low') return 1;
    return 0;
  };
  const preferredStructuredSymbol = rows
    .map((row: any, index: number) => ({ row, index }))
    .filter(({ row }) => evidenceModeRank(row) >= 2 && confidenceRank(row) >= 2)
    .sort((a, b) => {
      const modeDiff = evidenceModeRank(b.row) - evidenceModeRank(a.row);
      if (modeDiff !== 0) return modeDiff;
      const confidenceDiff = confidenceRank(b.row) - confidenceRank(a.row);
      if (confidenceDiff !== 0) return confidenceDiff;
      return a.index - b.index;
    })[0]?.row;
  const resourceAnchoredSymbol = rows.find(
    (row: any) => Array.isArray(row?.resourceBindings) && row.resourceBindings.length > 0,
  );
  const lowerQuery = String(input.queryText || '').toLowerCase();
  const firstMatchInQuery = rows.find((row: any) => lowerQuery.includes(String(row?.name || '').toLowerCase()));
  const anchor = preferredStructuredSymbol || resourceAnchoredSymbol || input.processSymbols[0] || firstMatchInQuery || input.definitions[0];
  const symbolName = String(anchor?.name || '').trim();
  const symbolFilePath = normalizePath(String(anchor?.filePath || '').trim());
  return {
    ...(symbolName ? { symbolName } : {}),
    ...(symbolFilePath ? { symbolFilePath } : {}),
  };
}

export function buildNextHops(input: {
  seedPath?: string;
  mappedSeedTargets: string[];
  resourceBindings: ResolvedUnityBinding[];
  verificationHint?: VerificationHint;
  retrievalRule?: RetrievalRuleHint;
  repoName?: string;
  symbolName: string;
  queryForSymbol: string;
}): NextHopPayload[] {
  const hops: NextHopPayload[] = [];
  const seen = new Set<string>();
  const addHop = (hop: NextHopPayload) => {
    const key = `${hop.kind}:${hop.target}`;
    if (seen.has(key)) return;
    seen.add(key);
    hops.push(hop);
  };

  const bindingPaths = input.resourceBindings.map((binding) => normalizePath(String(binding.resourcePath || '').trim())).filter(Boolean);
  const bindingSet = new Set(bindingPaths);
  const mappedIntersectBindings = input.mappedSeedTargets
    .map((value) => normalizePath(value))
    .filter((value) => value && bindingSet.has(value));
  const mappedRemainder = input.mappedSeedTargets
    .map((value) => normalizePath(value))
    .filter((value) => value && !bindingSet.has(value));

  const retrievalHostScope = (input.retrievalRule?.host_base_type || [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const currentSymbolMatchesRetrievalScope = retrievalHostScope.length === 0
    || retrievalHostScope.includes(String(input.symbolName || '').trim().toLowerCase());
  const shouldSuppressRawResourceHops = !input.seedPath
    && mappedIntersectBindings.length === 0
    && currentSymbolMatchesRetrievalScope === false;

  const candidateResources = shouldSuppressRawResourceHops ? [] : rankCandidateResources([
    ...(input.seedPath ? [{ target: normalizePath(input.seedPath), bucket: 0 }] : []),
    ...mappedIntersectBindings.map((target) => ({ target, bucket: 1 })),
    ...mappedRemainder.map((target) => ({ target, bucket: 2 })),
    ...bindingPaths.map((target) => ({ target, bucket: 3 })),
  ]);
  const repoArg = input.repoName ? ` --repo "${input.repoName}"` : '';
  const withRepoInCommand = (command: string): string => {
    const trimmed = String(command || '').trim();
    if (!trimmed || !input.repoName) return trimmed;
    if (!/^gitnexus\s+(query|context)\b/i.test(trimmed)) return trimmed;
    if (/\s--repo(?:\s|=)/i.test(trimmed)) return trimmed;
    return trimmed.replace(/^gitnexus\s+(query|context)\b/i, `gitnexus $1 --repo "${input.repoName}"`);
  };

  for (const target of candidateResources.slice(0, 3)) {
    addHop({
      kind: 'resource',
      target,
      why: 'Unity resource evidence suggests this is the next deterministic hop.',
      next_command: `gitnexus query${repoArg} --unity-resources on --unity-hydration parity --resource-path-prefix "${target}" "${input.queryForSymbol}"`,
    });
  }

  if (input.retrievalRule?.next_action) {
    addHop({
      kind: 'verify',
      target: input.seedPath || input.symbolName,
      why: `Retrieval rule ${input.retrievalRule.id} configured this follow-up action.`,
      next_command: withRepoInCommand(input.retrievalRule.next_action),
    });
  }

  if (
    input.verificationHint?.target
    && !(shouldSuppressRawResourceHops && isUnityResourcePathLike(String(input.verificationHint.target)))
  ) {
    addHop({
      kind: 'verify',
      target: String(input.verificationHint.target),
      why: 'Low-confidence evidence requires a verification follow-up.',
      next_command: withRepoInCommand(input.verificationHint.next_command),
    });
  }

  addHop({
    kind: 'symbol',
    target: input.symbolName,
    why: 'Inspect symbol-level context to continue tracing.',
    next_command: `gitnexus context${repoArg} --unity-resources on --unity-hydration parity "${input.symbolName}"`,
  });

  return hops.slice(0, 5);
}

function rankCandidateResources(candidates: Array<{ target: string; bucket: number }>): string[] {
  const deduped = new Map<string, { target: string; bucket: number; noisePenalty: number }>();
  for (const candidate of candidates) {
    const target = normalizePath(String(candidate.target || '').trim());
    if (!target) continue;
    const next = {
      target,
      bucket: candidate.bucket,
      noisePenalty: scoreResourcePathNoise(target),
    };
    const existing = deduped.get(target);
    if (!existing) {
      deduped.set(target, next);
      continue;
    }
    if (next.bucket < existing.bucket) existing.bucket = next.bucket;
    if (next.noisePenalty < existing.noisePenalty) existing.noisePenalty = next.noisePenalty;
  }

  return [...deduped.values()]
    .sort((a, b) => {
      const bucketDiff = a.bucket - b.bucket;
      if (bucketDiff !== 0) return bucketDiff;
      const noiseDiff = a.noisePenalty - b.noisePenalty;
      if (noiseDiff !== 0) return noiseDiff;
      return a.target.localeCompare(b.target);
    })
    .map((entry) => entry.target);
}

function scoreResourcePathNoise(resourcePath: string): number {
  const haystack = normalizePath(String(resourcePath || '').trim()).toLowerCase();
  let penalty = 0;
  if (!haystack) return penalty;
  if (haystack.includes('/test') || haystack.includes('testgraphs')) penalty += 5;
  if (haystack.includes('debug')) penalty += 4;
  if (haystack.includes('测试')) penalty += 6;
  if (haystack.includes('标记')) penalty += 6;
  return penalty;
}

async function resolveRetrievalRuleHint(input: {
  repoPath: string;
  queryText?: string;
  symbolName?: string;
  seedPath?: string;
}): Promise<RetrievalRuleHint | undefined> {
  const bundle = await loadCompiledRuleBundle(input.repoPath, 'retrieval_rules');
  if (!bundle) return undefined;
  return pickRetrievalRuleHintFromBundle({
    queryText: input.queryText,
    symbolName: input.symbolName,
    seedPath: input.seedPath,
    rules: bundle.rules,
  });
}

export function pickRetrievalRuleHintFromBundle(input: {
  queryText?: string;
  symbolName?: string;
  seedPath?: string;
  rules: Array<{
    id: string;
    trigger_tokens?: string[];
    host_base_type?: string[];
    resource_types?: string[];
    next_action: string;
  }>;
}): RetrievalRuleHint | undefined {
  const haystack = [
    String(input.queryText || ''),
    String(input.symbolName || ''),
    String(input.seedPath || ''),
  ].join(' ').toLowerCase();

  const rank = (rule: {
    trigger_tokens?: string[];
    host_base_type?: string[];
    resource_types?: string[];
  }): number => {
    let score = 0;
    let matchedTrigger = false;
    let matchedEvidence = false;
    for (const token of rule.trigger_tokens || []) {
      const normalized = String(token || '').trim().toLowerCase();
      if (!normalized) continue;
      if (haystack.includes(normalized)) {
        matchedTrigger = true;
        matchedEvidence = true;
        score += 10 + normalized.length;
      }
    }
    for (const token of rule.host_base_type || []) {
      const normalized = String(token || '').trim().toLowerCase();
      if (normalized && haystack.includes(normalized)) {
        matchedEvidence = true;
        score += 20 + normalized.length;
      }
    }
    for (const token of rule.resource_types || []) {
      const normalized = String(token || '').trim().toLowerCase();
      if (normalized && haystack.includes(normalized)) {
        matchedEvidence = true;
        score += 4 + normalized.length;
      }
    }
    if (!matchedEvidence) return Number.NEGATIVE_INFINITY;
    if (!matchedTrigger) score -= 3;
    return score;
  };

  const matched = [...input.rules]
    .map((rule) => ({ rule, score: rank(rule) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => (b.score - a.score) || a.rule.id.localeCompare(b.rule.id))[0]?.rule;
  if (!matched || !String(matched.next_action || '').trim()) return undefined;
  return {
    id: matched.id,
    next_action: matched.next_action,
    host_base_type: matched.host_base_type,
  };
}

export async function resolveSeedTargetsFromResourceFile(repoPath: string, seedPath: string): Promise<string[]> {
  if (!isUnityResourcePath(seedPath)) return [];
  try {
    const absPath = path.join(repoPath, seedPath);
    const raw = await fs.readFile(absPath, 'utf-8');
    const guidMatches = [...raw.matchAll(/\bguid:\s*([0-9a-f]{32})\b/ig)];
    if (guidMatches.length === 0) return [];
    const guidSet = new Set(guidMatches.map((m) => String(m[1] || '').toLowerCase()).filter(Boolean));
    const metaIndex = await buildAssetMetaIndex(repoPath);
    const out: string[] = [];
    for (const guid of guidSet) {
      const targetPath = normalizePath(String(metaIndex.get(guid) || '').trim());
      if (!targetPath || targetPath === normalizePath(seedPath) || !isUnityResourcePath(targetPath)) continue;
      if (!out.includes(targetPath)) out.push(targetPath);
    }
    return out;
  } catch {
    return [];
  }
}

function aggregateRuntimeChainEvidenceLevel(
  rows: Array<{ runtime_chain_evidence_level?: RuntimeChainEvidenceLevel }>,
): RuntimeChainEvidenceLevel {
  if (rows.some((row) => row.runtime_chain_evidence_level === 'verified_chain')) return 'verified_chain';
  if (rows.some((row) => row.runtime_chain_evidence_level === 'verified_segment')) return 'verified_segment';
  if (rows.some((row) => row.runtime_chain_evidence_level === 'clue')) return 'clue';
  return 'none';
}

function toProcessRefOrigin(mode: unknown): ProcessRefOrigin {
  if (mode === 'direct_step') return 'step_in_process';
  return 'method_projected';
}

function confidenceRank(confidence: unknown): number {
  if (confidence === 'high') return 3;
  if (confidence === 'medium') return 2;
  return 1;
}

function evidenceModeRank(mode: unknown): number {
  if (mode === 'direct_step') return 3;
  if (mode === 'method_projected') return 2;
  return 1;
}

export function filterBm25ResultsByScopePreset<T extends { filePath?: string }>(
  rows: T[],
  scopePreset?: string,
): T[] {
  const preset = resolveQueryScopePreset(scopePreset);
  if (!preset || preset === 'unity-all') return rows;

  if (preset === 'unity-gameplay') {
    return rows.filter((row) => {
      const p = normalizePath(row.filePath || '').toLowerCase();
      if (!p) return false;
      if (!matchesAnyPrefix(p, UNITY_GAMEPLAY_INCLUDE_PREFIXES)) return false;
      if (matchesAnyPrefix(p, UNITY_GAMEPLAY_EXCLUDE_PREFIXES)) return false;
      return true;
    });
  }

  return rows;
}

function scoreExpandedSymbolForQuery(
  symbol: ExpandedSymbolCandidate,
  queryTokens: string[],
  scopePreset?: string,
): number {
  const name = String(symbol.name || '').toLowerCase();
  const filePath = normalizePath(symbol.filePath || '').toLowerCase();
  const pathText = filePath.replace(/[^a-z0-9_]+/g, ' ');
  const hasPluginIntent = queryTokens.some((token) => UNITY_PLUGIN_INTENT_TOKENS.has(token));
  let score = 0;

  for (const token of queryTokens) {
    if (name === token) score += 8;
    else if (name.includes(token)) score += 3;
    if (pathText.includes(token)) score += 1;
  }

  if (queryTokens.length > 0) {
    const fileName = filePath.split('/').pop() || '';
    const fileNameNoExt = fileName.replace(/\.[a-z0-9]+$/i, '');
    if (queryTokens.includes(fileNameNoExt)) {
      score += 2;
    }
  }

  if (isUnityPluginPath(filePath) && !hasPluginIntent) {
    score -= scopePreset === 'unity-gameplay' ? 10 : 4;
  } else if (scopePreset === 'unity-gameplay' && isUnityGameplayPath(filePath)) {
    score += 2;
  }

  return score;
}

export function rankExpandedSymbolsForQuery(
  symbols: ExpandedSymbolCandidate[],
  query: string,
  limit: number = 3,
  scopePreset?: string,
): ExpandedSymbolCandidate[] {
  const queryTokens = tokenizeQuery(query);
  return [...symbols]
    .sort((a, b) => {
      const scoreDelta = scoreExpandedSymbolForQuery(b, queryTokens, scopePreset)
        - scoreExpandedSymbolForQuery(a, queryTokens, scopePreset);
      if (scoreDelta !== 0) return scoreDelta;
      const aLine = a.startLine ?? Number.MAX_SAFE_INTEGER;
      const bLine = b.startLine ?? Number.MAX_SAFE_INTEGER;
      if (aLine !== bLine) return aLine - bLine;
      return String(a.name || '').localeCompare(String(b.name || ''));
    })
    .slice(0, Math.max(1, limit));
}

function getUnityPathScoreMultiplier(filePath: string, queryTokens: string[], scopePreset?: string): number {
  const hasPluginIntent = queryTokens.some((token) => UNITY_PLUGIN_INTENT_TOKENS.has(token));
  if (isUnityPluginPath(filePath) && !hasPluginIntent) {
    return scopePreset === 'unity-gameplay' ? 0.1 : 0.45;
  }
  if (scopePreset === 'unity-gameplay' && isUnityGameplayPath(filePath)) {
    return 1.15;
  }
  return 1;
}

function bindingIdentity(binding: ResolvedUnityBinding): string {
  return [
    normalizePath(binding.resourcePath),
    binding.bindingKind,
    binding.componentObjectId,
  ].join('|');
}

export function mergeUnityBindings(
  baseBindings: ResolvedUnityBinding[],
  resolvedByPath: Map<string, ResolvedUnityBinding[]>,
): ResolvedUnityBinding[] {
  const merged: ResolvedUnityBinding[] = [];
  const expandedPaths = new Set<string>();

  for (const binding of baseBindings) {
    const resourcePath = normalizePath(binding.resourcePath);
    if (!binding.lightweight) {
      merged.push(binding);
      continue;
    }

    const expanded = resolvedByPath.get(resourcePath);
    if (expanded && expanded.length > 0) {
      if (!expandedPaths.has(resourcePath)) {
        merged.push(...expanded.map((row) => ({ ...row, lightweight: false })));
        expandedPaths.add(resourcePath);
      }
      continue;
    }

    merged.push(binding);
  }

  return merged;
}

export function mergeParityUnityBindings(
  baseNonLightweightBindings: ResolvedUnityBinding[],
  resolvedBindings: ResolvedUnityBinding[],
): ResolvedUnityBinding[] {
  const merged: ResolvedUnityBinding[] = [];
  const seen = new Set<string>();
  for (const row of [...baseNonLightweightBindings, ...resolvedBindings]) {
    const key = bindingIdentity(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...row, lightweight: false });
  }
  return merged;
}

export function attachUnityHydrationMeta(
  payload: UnityContextPayload,
  input: Pick<UnityHydrationMeta, 'requestedMode' | 'effectiveMode' | 'elapsedMs' | 'fallbackToCompact'> & {
    hasExpandableBindings: boolean;
  },
): UnityContextPayload {
  const { hasExpandableBindings, ...metaInput } = input;
  const reasons: string[] = [];
  if (metaInput.effectiveMode === 'compact' && hasExpandableBindings) {
    reasons.push('mode_compact');
  }
  if (metaInput.fallbackToCompact) {
    reasons.push('fallback_to_compact');
  }
  if (hasExpandableBindings) {
    reasons.push('lightweight_bindings_remaining');
  }
  if ((payload.unityDiagnostics || []).some((diag) => /budget exceeded/i.test(String(diag || '')))) {
    reasons.push('budget_exceeded');
  }
  const isComplete = reasons.length === 0;
  const needsParityRetry = !isComplete && metaInput.effectiveMode === 'compact';

  return {
    ...payload,
    hydrationMeta: {
      ...metaInput,
      resourceBindingCount: payload.resourceBindings.length,
      unityDiagnosticsCount: payload.unityDiagnostics.length,
      isComplete,
      completenessReason: reasons,
      needsParityRetry,
      ...(needsParityRetry ? { retryHint: 'rerun_with_unity_hydration=parity' } : {}),
    },
  };
}

/** Valid LadybugDB node labels for safe Cypher query construction */
export const VALID_NODE_LABELS = new Set([
  'File',
  'Folder',
  'Function',
  'Class',
  'Interface',
  'Method',
  'CodeElement',
  'Community',
  'Process',
  'Struct',
  'Enum',
  'Macro',
  'Typedef',
  'Union',
  'Namespace',
  'Trait',
  'Impl',
  'TypeAlias',
  'Const',
  'Static',
  'Property',
  'Record',
  'Delegate',
  'Annotation',
  'Constructor',
  'Template',
  'Module',
  'Route',
  'Tool',
]);

/** Valid relation types for impact analysis filtering */
export const VALID_RELATION_TYPES = new Set([
  'CALLS',
  'IMPORTS',
  'EXTENDS',
  'IMPLEMENTS',
  'HAS_METHOD',
  'HAS_PROPERTY',
  'METHOD_OVERRIDES',
  'OVERRIDES', // Legacy alias — dual-read for pre-rename indexes
  'METHOD_IMPLEMENTS',
  'ACCESSES',
  'HANDLES_ROUTE',
  'FETCHES',
  'HANDLES_TOOL',
  'ENTRY_POINT_OF',
  'WRAPS',
]);

/**
 * Per-relation-type confidence floor for impact analysis.
 *
 * When the graph stores a relation with a confidence value, that stored
 * value is used as-is (it reflects resolution-tier accuracy from analysis
 * time).  This map provides the floor for each edge type when no stored
 * confidence is available, and is also used for display / tooltip hints.
 *
 * Rationale:
 *   CALLS / IMPORTS  – direct, strongly-typed references → 0.9
 *   EXTENDS          – class hierarchy, statically verifiable → 0.85
 *   IMPLEMENTS       – interface contract, statically verifiable → 0.85
 *   METHOD_OVERRIDES  – method override, statically verifiable → 0.85
 *   METHOD_IMPLEMENTS – interface method implementation, statically verifiable → 0.85
 *   HAS_METHOD       – structural containment → 0.95
 *   HAS_PROPERTY     – structural containment → 0.95
 *   ACCESSES         – field read/write, may be indirect → 0.8
 *   CONTAINS         – folder/file containment → 0.95
 *   (unknown type)   – conservative fallback → 0.5
 */
export const IMPACT_RELATION_CONFIDENCE: Readonly<Record<string, number>> = {
  CALLS: 0.9,
  IMPORTS: 0.9,
  EXTENDS: 0.85,
  IMPLEMENTS: 0.85,
  METHOD_OVERRIDES: 0.85,
  METHOD_IMPLEMENTS: 0.85,
  HAS_METHOD: 0.95,
  HAS_PROPERTY: 0.95,
  ACCESSES: 0.8,
  CONTAINS: 0.95,
};

/**
 * Return the confidence floor for a given relation type.
 * Falls back to 0.5 for unknown types so they are not silently elevated.
 */
const confidenceForRelType = (relType: string | undefined): number =>
  IMPACT_RELATION_CONFIDENCE[relType ?? ''] ?? 0.5;

/** Structured error logging for query failures — replaces empty catch blocks */
function logQueryError(context: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error({ context, err: msg }, 'GitNexus query failed');
}

/**
 * Per-query latency telemetry for production aggregation (#553).
 *
 * Logged at `debug` level — timing is observability/telemetry, not an
 * error. Operators wanting per-query timing set `GITNEXUS_LOG_LEVEL=debug`
 * (or equivalent). Emitting at `error` level (the original migration
 * artifact) caused alerting rules to fire on every successful query and
 * inflated stderr noise for every MCP/CLI invocation.
 *
 * Emitted via the project logger which routes to stderr — never stdout —
 * because the MCP stdio transport uses stdout exclusively for JSON-RPC
 * responses (#324) and the CLI e2e test `tool output goes to stdout via
 * fd 1` asserts stdout parses cleanly as JSON.
 */
function logQueryTiming(query: string, phases: Record<string, number>): void {
  const totalMs = phases.wall ?? Object.values(phases).reduce((a, b) => a + b, 0);
  const truncated = query.length > 80 ? `${query.slice(0, 80)}…` : query;
  logger.debug({ query: truncated, totalMs, phases }, 'GitNexus query timing');
}

export interface CodebaseContext {
  projectName: string;
  stats: {
    fileCount: number;
    functionCount: number;
    communityCount: number;
    processCount: number;
  };
}

interface RepoHandle {
  id: string; // unique key = repo name (basename)
  name: string;
  repoPath: string;
  storagePath: string;
  lbugPath: string;
  indexedAt: string;
  lastCommit: string;
  remoteUrl?: string;
  stats?: RegistryEntry['stats'];
}

export class LocalBackend {
  private repos: Map<string, RepoHandle> = new Map();
  private contextCache: Map<string, CodebaseContext> = new Map();
  private initializedRepos: Set<string> = new Set();
  private reinitPromises: Map<string, Promise<void>> = new Map();
  private lastStalenessCheck: Map<string, number> = new Map();
  private groupToolSvc: GroupService | null = null;
  /**
   * One-shot stderr warnings for sibling-clone drift, keyed by
   * `${repoId}|${cwdGitRoot}`. Without this guard every tool call
   * from inside a sibling clone would print the same warning,
   * making MCP stderr unreadable.
   */
  private warnedSiblingDrift: Set<string> = new Set();

  /**
   * One-shot stderr warning for the VECTOR-extension fallback. Without this
   * guard the diagnostic would fire on every `semanticSearch()` call on
   * platforms where the extension is unsupported (e.g. Windows), making MCP
   * stderr noisy per DoD §2.8.
   */
  private warnedVectorUnsupported = false;

  /**
   * Cross-repo group tools (CLI). Shares logic with MCP `group_*` handlers.
   */
  getGroupService(): GroupService {
    if (!this.groupToolSvc) {
      const port: GroupToolPort = {
        resolveRepo: (p) => this.resolveRepo(p),
        impact: (r, p) => this.impact(r as RepoHandle, p),
        query: (r, p) => this.query(r as RepoHandle, p),
        impactByUid: (id, uid, d, o) => this.impactByUid(id, uid, d, o),
        context: (r, p) => this.context(r as RepoHandle, p),
      };
      this.groupToolSvc = new GroupService(port);
    }
    return this.groupToolSvc;
  }

  /** Close all pooled LadybugDB connections (CLI one-shot; optional for long-lived MCP). */
  async dispose(): Promise<void> {
    await closeLbug();
  }

  // ─── Initialization ──────────────────────────────────────────────

  /**
   * Initialize from the global registry.
   * Returns true if at least one repo is available.
   */
  async init(): Promise<boolean> {
    await this.refreshRepos();
    return this.repos.size > 0;
  }

  /**
   * Re-read the global registry and update the in-memory repo map.
   * New repos are added, existing repos are updated, removed repos are pruned.
   * LadybugDB connections for removed repos are NOT closed (they idle-timeout naturally).
   */
  private async refreshRepos(): Promise<void> {
    const entries = await listRegisteredRepos({ validate: true });
    const freshIds = new Set<string>();

    for (const entry of entries) {
      const id = this.repoId(entry.name, entry.path);
      freshIds.add(id);

      const storagePath = entry.storagePath;
      const lbugPath = path.join(storagePath, 'lbug');

      // Clean up any leftover KuzuDB files from before the LadybugDB migration.
      // If kuzu exists but lbug doesn't, warn so the user knows to re-analyze.
      const kuzu = await cleanupOldKuzuFiles(storagePath);
      if (kuzu.found && kuzu.needsReindex) {
        logger.error(
          `GitNexus: "${entry.name}" has a stale KuzuDB index. Run: gitnexus analyze ${entry.path}`,
        );
      }

      const handle: RepoHandle = {
        id,
        name: entry.name,
        repoPath: entry.path,
        storagePath,
        lbugPath,
        indexedAt: entry.indexedAt,
        lastCommit: entry.lastCommit,
        remoteUrl: entry.remoteUrl,
        stats: entry.stats,
      };

      this.repos.set(id, handle);

      // Build lightweight context (no LadybugDB needed)
      const s = entry.stats || {};
      this.contextCache.set(id, {
        projectName: entry.name,
        stats: {
          fileCount: s.files || 0,
          functionCount: s.nodes || 0,
          communityCount: s.communities || 0,
          processCount: s.processes || 0,
        },
      });
    }

    // Prune repos that no longer exist in the registry
    for (const id of this.repos.keys()) {
      if (!freshIds.has(id)) {
        this.repos.delete(id);
        this.contextCache.delete(id);
        this.initializedRepos.delete(id);
      }
    }
  }

  /**
   * Generate a stable repo ID from name + path.
   * If names collide, append a hash of the path.
   */
  private repoId(name: string, repoPath: string): string {
    const base = name.toLowerCase();
    // Check for name collision with a different path
    for (const [id, handle] of this.repos) {
      if (id === base && handle.repoPath !== path.resolve(repoPath)) {
        // Collision — use path hash
        const hash = Buffer.from(repoPath).toString('base64url').slice(0, 6);
        return `${base}-${hash}`;
      }
    }
    return base;
  }

  // ─── Repo Resolution ─────────────────────────────────────────────

  /**
   * Resolve which repo to use.
   * - If repoParam is given, match by name or path
   * - If only 1 repo, use it
   * - If 0 or multiple without param, throw with helpful message
   *
   * On a miss, re-reads the registry once in case a new repo was indexed
   * while the MCP server was running.
   */
  async resolveRepo(repoParam?: string): Promise<RepoHandle> {
    const result = this.resolveRepoFromCache(repoParam);
    if (result) {
      // Issue: silent graph drift across sibling clones.
      // If the caller's cwd lives in a *different* on-disk clone of
      // the same repo (matched by `remoteUrl`), warn once per
      // (repo, cwd) pair on stderr. We do not fail or refuse to
      // serve — the index is still the best answer we have — but
      // the operator/agent has to know the answer may be stale.
      this.maybeWarnSiblingDrift(result).catch(() => {
        /* best-effort; never throw from resolveRepo */
      });
      return result;
    }

    // Miss — refresh registry and try once more
    await this.refreshRepos();
    const retried = this.resolveRepoFromCache(repoParam);
    if (retried) {
      this.maybeWarnSiblingDrift(retried).catch(() => {});
      return retried;
    }

    // Still no match — throw with helpful message
    if (this.repos.size === 0) {
      throw new Error('No indexed repositories. Run: gitnexus analyze');
    }

    // Build a disambiguated "Available: …" list (#829). When two handles
    // share a name, annotate each colliding label with its path so the
    // caller can actually pick the right one. Single-name entries render
    // identically to pre-#829 output.
    const nameCounts = new Map<string, number>();
    for (const h of this.repos.values()) {
      const key = h.name.toLowerCase();
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    }
    const labels = [...this.repos.values()].map((h) =>
      (nameCounts.get(h.name.toLowerCase()) ?? 0) > 1 ? `${h.name} (${h.repoPath})` : h.name,
    );

    if (repoParam) {
      throw new Error(`Repository "${repoParam}" not found. Available: ${labels.join(', ')}`);
    }
    throw new Error(
      `Multiple repositories indexed. Specify which one with the "repo" parameter. Available: ${labels.join(', ')}`,
    );
  }

  /**
   * Try to resolve a repo from the in-memory cache. Returns null on miss.
   */
  private resolveRepoFromCache(repoParam?: string): RepoHandle | null {
    if (this.repos.size === 0) return null;

    if (repoParam) {
      const paramLower = repoParam.toLowerCase();
      // Match by id
      if (this.repos.has(paramLower)) return this.repos.get(paramLower)!;
      // Match by name (case-insensitive)
      for (const handle of this.repos.values()) {
        if (handle.name.toLowerCase() === paramLower) return handle;
      }
      // Match by path (substring)
      const resolved = path.resolve(repoParam);
      for (const handle of this.repos.values()) {
        if (handle.repoPath === resolved) return handle;
      }
      // Match by partial name
      for (const handle of this.repos.values()) {
        if (handle.name.toLowerCase().includes(paramLower)) return handle;
      }
      return null;
    }

    if (this.repos.size === 1) {
      return this.repos.values().next().value!;
    }

    return null; // Multiple repos, no param — ambiguous
  }

  // ─── Lazy LadybugDB Init ────────────────────────────────────────────

  private async ensureInitialized(repoId: string): Promise<void> {
    // If a reinit is already in progress for this repo, wait for it
    const pending = this.reinitPromises.get(repoId);
    if (pending) return pending;

    const handle = this.repos.get(repoId);
    if (!handle) throw new Error(`Unknown repo: ${repoId}`);

    // Check if the index was rebuilt since we opened the connection (#297).
    // Throttle staleness checks to at most once per 5 seconds per repo to
    // avoid an fs.readFile round-trip on every tool invocation.
    if (this.initializedRepos.has(repoId) && isLbugReady(repoId)) {
      const now = Date.now();
      const lastCheck = this.lastStalenessCheck.get(repoId) ?? 0;
      if (now - lastCheck < 5000) return; // Checked recently — skip

      this.lastStalenessCheck.set(repoId, now);
      try {
        const metaPath = path.join(handle.storagePath, 'meta.json');
        const metaRaw = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(metaRaw);
        if (meta.indexedAt && meta.indexedAt !== handle.indexedAt) {
          // Index was rebuilt — close stale connection and re-init.
          // Wrap in reinitPromises to prevent TOCTOU race where concurrent
          // callers both detect staleness and double-close the pool.
          const reinit = (async () => {
            try {
              await closeLbug(repoId);
              this.initializedRepos.delete(repoId);
              handle.indexedAt = meta.indexedAt;
              await initLbug(repoId, handle.lbugPath);
              this.initializedRepos.add(repoId);
            } finally {
              this.reinitPromises.delete(repoId);
            }
          })();
          this.reinitPromises.set(repoId, reinit);
          return reinit;
        } else {
          return; // Pool is current
        }
      } catch {
        return; // Can't read meta — assume pool is fine
      }
    }

    try {
      await initLbug(repoId, handle.lbugPath);
      this.initializedRepos.add(repoId);
    } catch (err: any) {
      // If lock error, mark as not initialized so next call retries
      this.initializedRepos.delete(repoId);
      throw err;
    }
  }

  // ─── Public Getters ──────────────────────────────────────────────

  /**
   * Get context for a specific repo (or the single repo if only one).
   */
  getContext(repoId?: string): CodebaseContext | null {
    if (repoId && this.contextCache.has(repoId)) {
      return this.contextCache.get(repoId)!;
    }
    if (this.repos.size === 1) {
      return this.contextCache.values().next().value ?? null;
    }
    return null;
  }

  /**
   * List all registered repos with their metadata.
   * Re-reads the global registry so newly indexed repos are discovered
   * without restarting the MCP server.
   *
   * Each entry includes:
   *   - `staleness`: if the indexed clone's own HEAD has moved past
   *     the recorded `lastCommit` (option D in the issue's fix list).
   *   - `siblings`: other registered entries sharing the same
   *     `remoteUrl` (option B's payoff: callers can see at a glance
   *     that another clone of the same logical repo is registered).
   *   - `remoteUrl`: the canonical origin URL recorded at index time.
   */
  async listRepos(): Promise<
    Array<{
      name: string;
      path: string;
      indexedAt: string;
      lastCommit: string;
      remoteUrl?: string;
      stats?: any;
      staleness?: { commitsBehind: number; hint?: string };
      siblings?: Array<{ name: string; path: string; lastCommit: string }>;
    }>
  > {
    await this.refreshRepos();
    const handles = [...this.repos.values()];

    // Pre-group registered handles by `remoteUrl` so the sibling
    // lookup is O(1) per handle. We reuse the in-memory `this.repos`
    // (already populated by `refreshRepos`) instead of doing a fresh
    // `readRegistry()` per entry — that would be N file reads for N
    // registered repos.
    const isWin = process.platform === 'win32';
    const norm = (p: string) => (isWin ? path.resolve(p).toLowerCase() : path.resolve(p));
    const byRemote = new Map<string, RepoHandle[]>();
    for (const h of handles) {
      if (!h.remoteUrl) continue;
      const list = byRemote.get(h.remoteUrl) ?? [];
      list.push(h);
      byRemote.set(h.remoteUrl, list);
    }

    // Check staleness for all repos in parallel instead of sequentially.
    // Each check spawns an async `git rev-list` — with 200 repos the sync
    // variant took ~50 s; parallel async brings it under a second (#1363).
    const stalenessResults = await Promise.all(
      handles.map((h) => checkStalenessAsync(h.repoPath, h.lastCommit)),
    );

    return handles.map((h, i) => {
      const stale = stalenessResults[i];
      const selfNorm = norm(h.repoPath);
      const siblings = h.remoteUrl
        ? (byRemote.get(h.remoteUrl) ?? []).filter((e) => norm(e.repoPath) !== selfNorm)
        : [];
      return {
        name: h.name,
        path: h.repoPath,
        indexedAt: h.indexedAt,
        lastCommit: h.lastCommit,
        remoteUrl: h.remoteUrl,
        stats: h.stats,
        staleness: stale.isStale
          ? { commitsBehind: stale.commitsBehind, hint: stale.hint }
          : undefined,
        siblings:
          siblings.length > 0
            ? siblings.map((s) => ({
                name: s.name,
                path: s.repoPath,
                lastCommit: s.lastCommit,
              }))
            : undefined,
      };
    });
  }

  /**
   * Best-effort sibling-clone drift warning.
   *
   * When the resolved index has a `remoteUrl` recorded and the caller's
   * `process.cwd()` is inside a *different* clone of the same repo, emit
   * one stderr line per (repo, cwd) pair so the operator knows the
   * graph may be stale relative to what's actually on disk under their
   * cwd. Silent on path matches and on repos without a remote URL.
   *
   * Limitation: in MCP stdio server mode `process.cwd()` is the
   * server's CWD at start time, *not* the agent client's CWD. The
   * warning therefore only fires when the MCP server itself was
   * launched from inside a sibling clone (typical for `npx gitnexus
   * serve` from a polecat workspace). Surfacing the client's CWD
   * would require a per-tool-call `cwd` parameter — out of scope for
   * the current MCP contract.
   *
   * Pure side-effect (stderr); never affects the returned handle.
   * After the first computation for a given (repo, cwd) pair the
   * result is cached so subsequent `resolveRepo()` calls don't
   * re-shell-out to git.
   */
  private async maybeWarnSiblingDrift(handle: RepoHandle): Promise<void> {
    if (!handle.remoteUrl) return;
    let cwd: string;
    try {
      cwd = process.cwd();
    } catch {
      return;
    }
    // Early-exit cache: keyed on (repo, cwd) BEFORE any git shellout.
    // After the first call for a given cwd, this short-circuits the
    // up-to-four `execSync`/`execFileSync` calls inside `checkCwdMatch`
    // — important for MCP-server mode where `process.cwd()` is constant
    // and `resolveRepo` runs on every tool call.
    const cacheKey = `${handle.id}|${cwd}`;
    if (this.warnedSiblingDrift.has(cacheKey)) return;

    const match = await checkCwdMatch(cwd);
    if (
      match.match !== 'sibling-by-remote' ||
      !match.entry ||
      !match.cwdGitRoot ||
      match.entry.path !== handle.repoPath ||
      !match.hint
    ) {
      // Cache "nothing to warn about" outcomes too — `checkCwdMatch`
      // is deterministic for a fixed (registry, cwd) pair, so re-running
      // it yields nothing new.
      this.warnedSiblingDrift.add(cacheKey);
      return;
    }

    this.warnedSiblingDrift.add(cacheKey);
    logger.error(`GitNexus: ${match.hint}`);
  }

  // ─── Tool Dispatch ───────────────────────────────────────────────

  async callTool(method: string, params: any): Promise<any> {
    if (method === 'list_repos') {
      return this.listRepos();
    }

    if (method.startsWith('group_')) {
      return this.handleGroupTool(method, params || {});
    }

    const p = params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
    if (
      (method === 'impact' || method === 'query' || method === 'context') &&
      typeof p.repo === 'string' &&
      p.repo.startsWith('@')
    ) {
      return this.callToolAtGroupRepo(method, p);
    }

    // Resolve repo from optional param (re-reads registry on miss)
    const repo = await this.resolveRepo((params as { repo?: string } | undefined)?.repo);

    switch (method) {
      case 'query':
        return this.query(repo, params);
      case 'cypher': {
        const raw = await this.cypher(repo, params);
        return this.formatCypherAsMarkdown(raw);
      }
      case 'context':
        return this.context(repo, params);
      case 'impact':
        return this.impact(repo, params);
      case 'unity_ui_trace':
        return this.unityUiTrace(repo, params);
      case 'detect_changes':
        return this.detectChanges(repo, params);
      case 'rename':
        return this.rename(repo, params);
      case 'rule_lab_analyze':
        return this.ruleLabAnalyze(repo, params);
      case 'rule_lab_review_pack':
        return this.ruleLabReviewPack(repo, params);
      case 'rule_lab_curate':
        return this.ruleLabCurate(repo, params);
      case 'rule_lab_promote':
        return this.ruleLabPromote(repo, params);
      case 'rule_lab_regress':
        return this.ruleLabRegress(repo, params);
      // Legacy aliases for backwards compatibility
      case 'search':
        return this.query(repo, params);
      case 'explore':
        return this.context(repo, { name: params?.name, ...params });
      case 'overview':
        return this.overview(repo, params);
      case 'route_map':
        return this.routeMap(repo, params);
      case 'shape_check':
        return this.shapeCheck(repo, params);
      case 'tool_map':
        return this.toolMap(repo, params);
      case 'api_impact':
        return this.apiImpact(repo, params);
      default:
        throw new Error(`Unknown tool: ${method}`);
    }
  }

  private async unityUiTrace(repo: RepoHandle, params: {
    target?: string;
    goal?: UnityUiTraceGoal;
    selector_mode?: UnityUiSelectorMode;
  }): Promise<any> {
    const target = String(params?.target || '').trim();
    const goal = params?.goal;
    const selectorMode = params?.selector_mode || 'balanced';
    if (!target) {
      return { error: 'target parameter is required and cannot be empty.' };
    }
    if (goal !== 'asset_refs' && goal !== 'template_refs' && goal !== 'selector_bindings') {
      return { error: 'goal must be one of: asset_refs, template_refs, selector_bindings.' };
    }
    if (selectorMode !== 'strict' && selectorMode !== 'balanced') {
      return { error: 'selector_mode must be one of: strict, balanced.' };
    }

    try {
      return await runUnityUiTrace({
        repoRoot: repo.repoPath,
        target,
        goal,
        selectorMode,
      });
    } catch (err: any) {
      return { error: err?.message || 'unity_ui_trace failed' };
    }
  }

  private async ruleLabAnalyze(repo: RepoHandle, params: {
    run_id?: string;
    runId?: string;
    slice_id?: string;
    sliceId?: string;
  }): Promise<any> {
    const runId = String(params?.run_id || params?.runId || '').trim();
    const sliceId = String(params?.slice_id || params?.sliceId || '').trim();
    if (!runId || !sliceId) {
      return { error: 'run_id and slice_id are required for rule_lab_analyze' };
    }
    try {
      const out = await analyzeRuleLabSlice({
        repoPath: repo.repoPath,
        runId,
        sliceId,
      });
      return {
        ...out,
        artifact_paths: {
          candidates: out.paths.candidatesPath,
        },
      };
    } catch (err: any) {
      return { error: err?.message || 'rule_lab_analyze failed' };
    }
  }

  private async ruleLabReviewPack(repo: RepoHandle, params: {
    run_id?: string;
    runId?: string;
    slice_id?: string;
    sliceId?: string;
    max_tokens?: number;
    maxTokens?: number;
  }): Promise<any> {
    const runId = String(params?.run_id || params?.runId || '').trim();
    const sliceId = String(params?.slice_id || params?.sliceId || '').trim();
    if (!runId || !sliceId) {
      return { error: 'run_id and slice_id are required for rule_lab_review_pack' };
    }
    const maxTokens = Number.isFinite(Number(params?.max_tokens ?? params?.maxTokens))
      ? Number(params?.max_tokens ?? params?.maxTokens)
      : 6000;
    try {
      const out = await buildReviewPack({
        repoPath: repo.repoPath,
        runId,
        sliceId,
        maxTokens,
      });
      return {
        ...out,
        artifact_paths: {
          review_pack: out.paths.reviewCardsPath,
        },
      };
    } catch (err: any) {
      return { error: err?.message || 'rule_lab_review_pack failed' };
    }
  }

  private async ruleLabCurate(repo: RepoHandle, params: {
    run_id?: string;
    runId?: string;
    slice_id?: string;
    sliceId?: string;
    input_path?: string;
    inputPath?: string;
  }): Promise<any> {
    const runId = String(params?.run_id || params?.runId || '').trim();
    const sliceId = String(params?.slice_id || params?.sliceId || '').trim();
    const inputPath = String(params?.input_path || params?.inputPath || '').trim();
    if (!runId || !sliceId || !inputPath) {
      return { error: 'run_id, slice_id, and input_path are required for rule_lab_curate' };
    }
    try {
      const out = await curateRuleLabSlice({
        repoPath: repo.repoPath,
        runId,
        sliceId,
        inputPath,
      });
      return {
        ...out,
        artifact_paths: {
          curated: out.paths.curatedPath,
        },
      };
    } catch (err: any) {
      return { error: err?.message || 'rule_lab_curate failed' };
    }
  }

  private async ruleLabPromote(repo: RepoHandle, params: {
    run_id?: string;
    runId?: string;
    slice_id?: string;
    sliceId?: string;
    version?: string;
  }): Promise<any> {
    const runId = String(params?.run_id || params?.runId || '').trim();
    const sliceId = String(params?.slice_id || params?.sliceId || '').trim();
    if (!runId || !sliceId) {
      return { error: 'run_id and slice_id are required for rule_lab_promote' };
    }
    try {
      const out = await promoteCuratedRules({
        repoPath: repo.repoPath,
        runId,
        sliceId,
        version: typeof params?.version === 'string' ? params.version : undefined,
      });
      return {
        ...out,
        artifact_paths: {
          catalog: path.join(out.paths.rulesRoot, 'catalog.json'),
          promoted_files: out.promotedFiles,
          compiled_bundles: out.compiledPaths,
        },
      };
    } catch (err: any) {
      return { error: err?.message || 'rule_lab_promote failed' };
    }
  }

  private async ruleLabRegress(repo: RepoHandle, params: {
    precision?: number;
    coverage?: number;
    probes?: Array<any>;
    probes_path?: string;
    probesPath?: string;
    run_id?: string;
    runId?: string;
  }): Promise<any> {
    const precision = Number(params?.precision);
    const coverage = Number(params?.coverage);
    if (!Number.isFinite(precision) || !Number.isFinite(coverage)) {
      return { error: 'precision and coverage are required numeric fields for rule_lab_regress' };
    }
    try {
      let probes = Array.isArray(params?.probes) ? params.probes : undefined;
      const probesPath = String(params?.probes_path || params?.probesPath || '').trim();
      if (!probes && probesPath) {
        const raw = await fs.readFile(path.isAbsolute(probesPath) ? probesPath : path.join(repo.repoPath, probesPath), 'utf-8');
        probes = JSON.parse(raw) as Array<any>;
      }
      const out = await runRuleLabRegress({
        precision,
        coverage,
        probes,
        repoPath: repo.repoPath,
        runId: String(params?.run_id || params?.runId || '').trim() || undefined,
      });
      return {
        ...out,
        artifact_paths: out.reportPath ? { report: out.reportPath } : {},
      };
    } catch (err: any) {
      return { error: err?.message || 'rule_lab_regress failed' };
    }
  }

  // ─── Tool Implementations ────────────────────────────────────────

  /**
   * Query tool — process-grouped search.
   *
   * 1. Hybrid search (BM25 + semantic) to find matching symbols
   * 2. Trace each match to its process(es) via STEP_IN_PROCESS
   * 3. Group by process, rank by aggregate relevance + internal cluster cohesion
   * 4. Return: { processes, process_symbols, definitions }
   */
  private async query(repo: RepoHandle, params: {
    query: string;
    task_context?: string;
    goal?: string;
    limit?: number;
    max_symbols?: number;
    include_content?: boolean;
    scope_preset?: string;
    unity_resources?: string;
    unity_hydration_mode?: string;
    unity_evidence_mode?: string;
    hydration_policy?: string;
    resource_path_prefix?: string;
    binding_kind?: string;
    max_bindings?: number;
    max_reference_fields?: number;
    resource_seed_mode?: string;
    runtime_chain_verify?: string;
    response_profile?: string;
  }): Promise<any> {
    if (!params.query?.trim()) {
      return { error: 'query parameter is required and cannot be empty.' };
    }

    await this.ensureInitialized(repo.id);

    const processLimit = params.limit || 5;
    const maxSymbolsPerProcess = params.max_symbols || 10;
    const includeContent = params.include_content ?? false;
    const confidenceFieldsEnabled = true;
    let unityResourcesMode: 'off' | 'on' | 'auto' = 'off';
    let unityHydrationMode: 'compact' | 'parity' = 'compact';
    let unityEvidenceMode: 'summary' | 'focused' | 'full' = 'summary';
    let hydrationPolicy: 'fast' | 'balanced' | 'strict' = 'balanced';
    let resourceSeedMode: ResourceSeedMode = 'balanced';
    try {
      unityResourcesMode = parseUnityResourcesMode(params.unity_resources);
      unityHydrationMode = parseUnityHydrationMode(params.unity_hydration_mode);
      unityEvidenceMode = parseUnityEvidenceMode(params.unity_evidence_mode);
      hydrationPolicy = parseHydrationPolicy(params.hydration_policy);
      resourceSeedMode = parseResourceSeedMode(params.resource_seed_mode);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
    const evidenceMaxBindings = Number.isFinite(Number(params.max_bindings))
      ? Number(params.max_bindings)
      : undefined;
    const evidenceMaxReferenceFields = Number.isFinite(Number(params.max_reference_fields))
      ? Number(params.max_reference_fields)
      : undefined;
    const evidenceResourcePathPrefix = String(params.resource_path_prefix || '').trim() || undefined;
    const seedPath = resolveSeedPath({
      queryText: params.query,
      resourcePathPrefix: evidenceResourcePathPrefix,
    });
    const evidenceBindingKind = String(params.binding_kind || '').trim() || undefined;
    const searchQuery = params.query.trim();
    const runtimeChainVerifyMode = String(params.runtime_chain_verify || 'off').trim().toLowerCase() as RuntimeChainVerifyMode;
    const responseProfile = resolveResponseProfile(params.response_profile);
    let mappedSeedTargets: string[] = [];
    if (seedPath) {
      try {
        const seedRows = await executeParameterized(repo.id, `
          MATCH (:File {filePath: $seedPath})-[r:CodeRelation {type: 'UNITY_ASSET_GUID_REF'}]->(target:File)
          RETURN DISTINCT target.filePath AS targetPath, r.reason AS relationReason
          LIMIT 100
        `, { seedPath });
        const candidates: SeedTargetCandidate[] = seedRows
          .map((row: any) => {
            const targetPath = normalizePath(String(row?.targetPath || row?.[0] || '').trim());
            const parsedReason = parseSeedRelationReason(row?.relationReason);
            return {
              targetPath,
              fieldName: parsedReason.fieldName,
              sourceLayer: parsedReason.sourceLayer,
            };
          })
          .filter((row) => row.targetPath.length > 0);
        mappedSeedTargets = rankSeedTargetCandidates(seedPath, candidates);
      } catch (e) {
        logQueryError('query:seed-mapped-targets', e);
      }
      if (mappedSeedTargets.length === 0) {
        mappedSeedTargets = rankSeedTargetCandidates(
          seedPath,
          (await resolveSeedTargetsFromResourceFile(repo.repoPath, seedPath)).map((targetPath) => ({ targetPath })),
        );
      }
    }
    
    // Step 1: Run hybrid search to get matching symbols
    const searchLimit = processLimit * maxSymbolsPerProcess; // fetch enough raw results
    const [bm25Results, semanticResults] = await Promise.all([
      this.bm25Search(repo, searchQuery, searchLimit, params.scope_preset),
      this.semanticSearch(repo, searchQuery, searchLimit),
    ]);

    const bm25Results = bm25SearchResult.results;
    const ftsUsed = bm25SearchResult.ftsUsed;

    // Merge via reciprocal rank fusion
    timer.start('merge');
    const scoreMap = new Map<string, { score: number; data: any }>();

    for (let i = 0; i < bm25Results.length; i++) {
      const result = bm25Results[i];
      const key = result.nodeId || result.filePath;
      const rrfScore = 1 / (60 + i);
      const existing = scoreMap.get(key);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scoreMap.set(key, { score: rrfScore, data: result });
      }
    }

    for (let i = 0; i < semanticResults.length; i++) {
      const result = semanticResults[i];
      const key = result.nodeId || result.filePath;
      const rrfScore = 1 / (60 + i);
      const existing = scoreMap.get(key);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scoreMap.set(key, { score: rrfScore, data: result });
      }
    }

    const merged = Array.from(scoreMap.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, searchLimit);
    timer.stop(); // merge

    // Step 2: For each match with a nodeId, trace to process(es)
    const processMap = new Map<string, {
      id: string;
      process_ref: ReturnType<typeof buildProcessRef>;
      label: string;
      heuristicLabel: string;
      processType: string;
      processSubtype?: string;
      runtimeChainConfidence?: string;
      stepCount: number;
      totalScore: number;
      cohesionBoost: number;
      symbols: any[];
    }>();
    const definitions: any[] = []; // standalone symbols not in any process

    for (const [_, item] of merged) {
      const sym = item.data;
      if (!sym.nodeId) {
        // File-level results go to definitions
        definitions.push({
          name: sym.name,
          type: sym.type || 'File',
          filePath: sym.filePath,
        });
        continue;
      }
      
      // Find processes this symbol participates in (direct + method projection for class-like symbols).
      let directProcessRows: any[] = [];
      let projectedProcessRows: any[] = [];
      try {
          directProcessRows = await executeParameterized(repo.id, `
          MATCH (n {id: $nodeId})-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process)
          RETURN p.id AS pid, p.label AS label, p.heuristicLabel AS heuristicLabel, p.processType AS processType, p.processSubtype AS processSubtype, p.runtimeChainConfidence AS runtimeChainConfidence, p.stepCount AS stepCount, r.step AS step
        `, { nodeId: sym.nodeId });
      } catch (e) { logQueryError('query:process-lookup', e); }
      const symIdLower = String(sym.nodeId).toLowerCase();
      const isClassLike = ['Class', 'Interface', 'Struct', 'Trait', 'Impl', 'Record'].includes(String(sym.type || ''))
        || symIdLower.startsWith('class:')
        || symIdLower.startsWith('interface:')
        || symIdLower.startsWith('struct:')
        || symIdLower.startsWith('trait:')
        || symIdLower.startsWith('impl:')
        || symIdLower.startsWith('record:');
      if (isClassLike) {
        try {
          projectedProcessRows = await executeParameterized(repo.id, `
            MATCH (n {id: $nodeId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)
            MATCH (m)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process)
            RETURN p.id AS pid, p.label AS label, p.heuristicLabel AS heuristicLabel, p.processType AS processType, p.processSubtype AS processSubtype, p.runtimeChainConfidence AS runtimeChainConfidence, p.stepCount AS stepCount, MIN(r.step) AS step
          `, { nodeId: sym.nodeId });
        } catch (e) { logQueryError('query:method-process-projection', e); }
      }
      let processRows = mergeProcessEvidence({
        directRows: directProcessRows,
        projectedRows: isClassLike ? projectedProcessRows : [],
      });

      // Get cluster membership + cohesion (cohesion used as internal ranking signal)
      let cohesion = 0;
      let module: string | undefined;
      try {
        const cohesionRows = await executeParameterized(
          repo.id,
          `
          MATCH (n {id: $nodeId})-[:CodeRelation {type: 'MEMBER_OF'}]->(c:Community)
          RETURN c.cohesion AS cohesion, c.heuristicLabel AS module
          LIMIT 1
        `,
          { nodeId: sym.nodeId },
        );
        if (cohesionRows.length > 0) {
          cohesion = (cohesionRows[0].cohesion ?? cohesionRows[0][0]) || 0;
          module = cohesionRows[0].module ?? cohesionRows[0][1];
        }
      } catch (e) {
        logQueryError('query:cluster-info', e);
      }

      // Optionally fetch content
      let content: string | undefined;
      if (includeContent) {
        try {
          const contentRows = await executeParameterized(
            repo.id,
            `
            MATCH (n {id: $nodeId})
            RETURN n.content AS content
          `,
            { nodeId: sym.nodeId },
          );
          if (contentRows.length > 0) {
            content = contentRows[0].content ?? contentRows[0][0];
          }
        } catch (e) {
          logQueryError('query:content-fetch', e);
        }
      }

      let unityPayload: Record<string, unknown> = {};
      if (
        unityResourcesMode !== 'off'
        && sym.nodeId
        && (sym.type === 'Class' || String(sym.nodeId).toLowerCase().startsWith('class:'))
      ) {
        const basePayload = await loadUnityContext(repo.id, sym.nodeId, (query) => executeQuery(repo.id, query));
        const hydrationDecision = resolveHydrationModeDecision({
          hydrationPolicy,
          unityHydrationMode,
        });
        let hydrationReason = hydrationDecision.reason;
        let hydrated = await hydrateUnityForSymbol({
          mode: hydrationDecision.requestedMode,
          basePayload,
          deps: {
            executeQuery: (query, queryParams) => {
              if (queryParams && Object.keys(queryParams).length > 0) {
                return executeParameterized(repo.id, query, queryParams);
              }
              return executeQuery(repo.id, query);
            },
            repoPath: repo.repoPath,
            storagePath: repo.storagePath,
            indexedCommit: repo.lastCommit,
          },
          symbol: {
            uid: sym.nodeId,
            name: sym.name || '',
            filePath: sym.filePath || '',
          },
        });
        const firstMissingEvidence = buildMissingEvidenceFromHydrationMeta(hydrated.hydrationMeta);
        if (hydrationPolicy === 'balanced' && firstMissingEvidence.length > 0 && hydrated.hydrationMeta?.needsParityRetry) {
          hydrated = await hydrateUnityForSymbol({
            mode: 'parity',
            basePayload,
            deps: {
              executeQuery: (query, queryParams) => {
                if (queryParams && Object.keys(queryParams).length > 0) {
                  return executeParameterized(repo.id, query, queryParams);
                }
                return executeQuery(repo.id, query);
              },
              repoPath: repo.repoPath,
              storagePath: repo.storagePath,
              indexedCommit: repo.lastCommit,
            },
            symbol: {
              uid: sym.nodeId,
              name: sym.name || '',
              filePath: sym.filePath || '',
            },
          });
          hydrationReason = 'hydration_policy_balanced_escalated_to_parity_on_missing_evidence';
        }
        if (hydrated.hydrationMeta?.fallbackToCompact) {
          hydrationReason = `${hydrationReason}+fallback_to_compact`;
        }
        hydrated = withHydrationDecisionMeta({
          payload: hydrated,
          requestedMode: hydrationDecision.requestedMode,
          reason: hydrationReason,
        });
        const finalMissingEvidence = buildMissingEvidenceFromHydrationMeta(hydrated.hydrationMeta);
        unityPayload = {
          ...hydrated,
          missing_evidence: hydrationPolicy === 'balanced'
            ? [...new Set([...firstMissingEvidence, ...finalMissingEvidence])]
            : finalMissingEvidence,
        };
      }

      const symbolEntry = {
        id: sym.nodeId,
        name: sym.name,
        type: sym.type,
        filePath: sym.filePath,
        startLine: sym.startLine,
        endLine: sym.endLine,
        ...(module ? { module } : {}),
        ...(includeContent && content ? { content } : {}),
        ...unityPayload,
      };

      if (Array.isArray((symbolEntry as any).resourceBindings) && (symbolEntry as any).resourceBindings.length > 0) {
        const evidenceView = buildUnityEvidenceView({
          resourceBindings: (symbolEntry as any).resourceBindings,
          mode: unityEvidenceMode,
          scopePreset: params.scope_preset,
          resourcePathPrefix: evidenceResourcePathPrefix,
          bindingKind: evidenceBindingKind,
          maxBindings: evidenceMaxBindings,
          maxReferenceFields: evidenceMaxReferenceFields,
        });
        (symbolEntry as any).resourceBindings = evidenceView.resourceBindings;
        (symbolEntry as any).serializedFields = evidenceView.serializedFields;
        (symbolEntry as any).evidence_meta = evidenceView.evidence_meta;
        (symbolEntry as any).filter_diagnostics = evidenceView.filter_diagnostics;
      }

      if (processRows.length === 0) {
        // Symbol not in any process — goes to definitions
        definitions.push(symbolEntry);
      } else {
        // Add to each process it belongs to
        for (const row of processRows) {
          const rawPid = String(row.pid || '');
          const label = String((row as any).label || '');
          const hLabel = String((row as any).heuristicLabel || label);
          const pType = String((row as any).processType || '');
          const stepCount = Number((row as any).stepCount || 0);
          const step = Number((row as any).step || 0);
          const process_ref = buildProcessRef({
            repoName: repo.name,
            processId: rawPid,
            origin: toProcessRefOrigin(row.evidence_mode),
            indexedCommit: String(repo.lastCommit || 'unknown_commit'),
            symbolUid: String(sym.nodeId || ''),
            evidenceFingerprint: deriveEvidenceFingerprint(
              { nodeId: sym.nodeId, filePath: sym.filePath, startLine: sym.startLine, endLine: sym.endLine },
              {
                pid: rawPid,
                processSubtype: (row as any).processSubtype || '',
                evidenceMode: row.evidence_mode,
                step,
                stepCount,
              },
              Array.isArray((symbolEntry as any).resourceBindings)
                ? (symbolEntry as any).resourceBindings.map((binding: any) => ({
                  resourcePath: binding.resourcePath,
                  bindingKind: binding.bindingKind,
                  componentObjectId: binding.componentObjectId,
                }))
                : [],
            ),
          });
          const pid = process_ref.id;
          
          if (!processMap.has(pid)) {
            processMap.set(pid, {
              id: pid,
              process_ref,
              label,
              heuristicLabel: hLabel,
              processType: pType,
              stepCount,
              processSubtype: String((row as any).processSubtype || ''),
              runtimeChainConfidence: String((row as any).runtimeChainConfidence || ''),
              totalScore: 0,
              cohesionBoost: 0,
              symbols: [],
            });
          }

          const proc = processMap.get(pid)!;
          proc.totalScore += item.score;
          proc.cohesionBoost = Math.max(proc.cohesionBoost, cohesion);
          proc.symbols.push({
            ...symbolEntry,
            process_id: pid,
            process_ref,
            step_index: step,
            process_subtype: String((row as any).processSubtype || ''),
            process_evidence_mode: row.evidence_mode,
            process_confidence: row.confidence,
            ...(confidenceFieldsEnabled ? {
              runtime_chain_confidence: row.confidence,
              runtime_chain_evidence_level: row.runtime_chain_evidence_level,
              verification_hint: (row as any).verification_hint,
            } : {}),
          });
        }
      }
    }

    timer.stop(); // symbol_lookup

    // Step 3: Rank processes by aggregate score + internal cohesion boost
    timer.start('ranking');
    const rankedProcesses = Array.from(processMap.values())
      .map((p) => ({
        ...p,
        priority: p.totalScore + p.cohesionBoost * 0.1, // cohesion as subtle ranking signal
      }))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, processLimit);
    timer.stop(); // ranking

    // Step 4: Build response
    timer.start('formatting');
    const processes = rankedProcesses.map((p) => ({
      id: p.id,
      process_ref: p.process_ref,
      summary: p.heuristicLabel || p.label,
      priority: Math.round(p.priority * 1000) / 1000,
      symbol_count: p.symbols.length,
      process_type: p.processType,
      process_subtype: (p as any).processSubtype || undefined,
      step_count: p.stepCount,
      evidence_mode: aggregateProcessEvidenceMode(p.symbols),
      confidence: aggregateProcessConfidence(p.symbols),
      ...(confidenceFieldsEnabled ? {
        runtime_chain_confidence: aggregateProcessConfidence(p.symbols),
        runtime_chain_evidence_level: aggregateRuntimeChainEvidenceLevel(p.symbols),
        verification_hint: selectVerificationHint(p.symbols),
      } : {}),
    }));

    const processSymbols = rankedProcesses.flatMap((p) =>
      p.symbols.slice(0, maxSymbolsPerProcess).map((s) => ({
        ...s,
        // remove internal fields
      })),
    );
    
    // Deduplicate process_symbols by id, keeping the highest-confidence/evidence variant.
    const dedupedById = new Map<string, any>();
    for (const symbol of processSymbols) {
      const existing = dedupedById.get(symbol.id);
      if (!existing) {
        dedupedById.set(symbol.id, symbol);
        continue;
      }

      const existingScore =
        (confidenceRank(existing.process_confidence) * 10)
        + evidenceModeRank(existing.process_evidence_mode);
      const nextScore =
        (confidenceRank(symbol.process_confidence) * 10)
        + evidenceModeRank(symbol.process_evidence_mode);
      if (nextScore > existingScore) {
        dedupedById.set(symbol.id, symbol);
      }
    }
    const dedupedSymbols = [...dedupedById.values()];
    
    const result: any = {
      processes,
      process_symbols: dedupedSymbols,
      definitions: definitions.slice(0, 20), // cap standalone definitions
      timing,
      ...(!ftsUsed && {
        warning:
          'FTS extension unavailable - keyword search degraded. Run: gitnexus analyze --force to rebuild indexes.',
      }),
    };
    if (unityResourcesMode !== 'off' && seedPath) {
      result.resource_chains = await loadSeedUnityResourceChains({
        repoId: repo.id,
        seedPath,
        targetSymbols: [
          exactResourceChainQuerySymbol(searchQuery),
          ...[...dedupedSymbols, ...definitions].map((row: any) => ({
            id: row?.id,
            name: row?.name,
            filePath: row?.filePath,
          })),
        ].filter(Boolean) as ResourceChainTargetSymbol[],
      });
    }
    const hydrationMetas = [...dedupedSymbols, ...definitions]
      .map((row: any) => row?.hydrationMeta)
      .filter(Boolean);
    if (hydrationMetas.length > 0) {
      result.hydrationMeta = hydrationMetas[0];
    }
    const verifierAnchor = pickVerifierSymbolAnchor({
      queryText: searchQuery,
      processSymbols: dedupedSymbols,
      definitions,
    });
    const firstSymbolForHops =
      dedupedSymbols.find((row: any) => String(row?.name || '') === verifierAnchor.symbolName)
      || definitions.find((row: any) => String(row?.name || '') === verifierAnchor.symbolName)
      || dedupedSymbols[0]
      || definitions[0];
    const firstVerificationHint = processes.find((row: any) => row?.verification_hint)?.verification_hint;
    const firstResourceBindings = Array.isArray(firstSymbolForHops?.resourceBindings)
      ? firstSymbolForHops.resourceBindings
      : [];
    const retrievalRule = await resolveRetrievalRuleHint({
      repoPath: repo.repoPath,
      queryText: params.query,
      symbolName: String(firstSymbolForHops?.name || searchQuery),
      seedPath,
    });
    result.next_hops = buildNextHops({
      seedPath,
      mappedSeedTargets,
      resourceBindings: firstResourceBindings,
      verificationHint: firstVerificationHint,
      retrievalRule,
      repoName: repo.name,
      symbolName: String(firstSymbolForHops?.name || searchQuery),
      queryForSymbol: String(firstSymbolForHops?.name || searchQuery),
    });
    const queryStrictAnchorMode = Boolean(evidenceResourcePathPrefix);
    result.decision_context = {
      strict_anchor_mode: queryStrictAnchorMode,
      anchor_symbol_name: String(firstSymbolForHops?.name || verifierAnchor.symbolName || searchQuery),
      anchor_resource_path: evidenceResourcePathPrefix || seedPath || mappedSeedTargets[0] || null,
    };
    const missingEvidenceRows = [...dedupedSymbols, ...definitions]
      .flatMap((row: any) => (Array.isArray(row?.missing_evidence) ? row.missing_evidence : []));
    result.missing_evidence = [...new Set(missingEvidenceRows)];
    const evidenceMetaRows = [...dedupedSymbols, ...definitions]
      .map((row: any) => row?.evidence_meta)
      .filter(Boolean);
    const filterDiagnostics = [...dedupedSymbols, ...definitions]
      .flatMap((row: any) => (Array.isArray(row?.filter_diagnostics) ? row.filter_diagnostics : []));
    if (evidenceMetaRows.length > 0) {
      const explicitTrimRequested = evidenceMaxBindings !== undefined || evidenceMaxReferenceFields !== undefined;
      let omittedCount = evidenceMetaRows.reduce(
        (sum: number, row: any) => sum + Number(row.omitted_count || 0),
        0,
      );
      const allBindings = [...dedupedSymbols, ...definitions]
        .flatMap((row: any) => (Array.isArray(row?.resourceBindings) ? row.resourceBindings : []));
      const extraBindingOmission = (evidenceMaxBindings !== undefined && allBindings.length > evidenceMaxBindings)
        ? (allBindings.length - evidenceMaxBindings)
        : 0;
      omittedCount += extraBindingOmission;
      if (explicitTrimRequested && omittedCount === 0) {
        omittedCount = 1;
      }
      const truncated = evidenceMetaRows.some((row: any) => Boolean(row.truncated))
        || extraBindingOmission > 0
        || explicitTrimRequested;
      const filterExhausted = evidenceMetaRows.some((row: any) => Boolean(row.filter_exhausted));
      result.evidence_meta = {
        truncated,
        omitted_count: omittedCount,
        ...(truncated ? { next_fetch_hint: 'Rerun with unity_evidence_mode=full to fetch complete evidence.' } : {}),
        ...(filterExhausted ? { filter_exhausted: true } : {}),
        minimum_evidence_satisfied: !explicitTrimRequested
          && extraBindingOmission === 0
          && evidenceMetaRows.every((row: any) => row.minimum_evidence_satisfied !== false),
        verifier_minimum_evidence_satisfied: computeVerifierMinimumEvidenceSatisfied({
          evidenceMetaRows,
          truncated,
          filterExhausted,
        }),
      };
      if (filterDiagnostics.length > 0) {
        result.filter_diagnostics = [...new Set(filterDiagnostics)];
      }
    } else if (
      unityResourcesMode !== 'off'
      && (evidenceMaxBindings !== undefined || evidenceMaxReferenceFields !== undefined)
    ) {
      result.evidence_meta = {
        truncated: true,
        omitted_count: 1,
        next_fetch_hint: 'Rerun with unity_evidence_mode=full to fetch complete evidence.',
        minimum_evidence_satisfied: false,
        verifier_minimum_evidence_satisfied: false,
      };
    }
    if (runtimeChainVerifyMode === 'on-demand') {
      const resourceBindings = dedupedSymbols
        .flatMap((symbol: any) => (Array.isArray(symbol.resourceBindings) ? symbol.resourceBindings : []))
        .concat(definitions.flatMap((symbol: any) => (Array.isArray(symbol.resourceBindings) ? symbol.resourceBindings : [])));
      result.runtime_claim = await verifyRuntimeClaimOnDemand({
        repoPath: repo.repoPath,
        executeParameterized: (query, queryParams) => executeParameterized(repo.id, query, queryParams || {}),
        queryText: searchQuery || verifierAnchor.symbolName || seedPath,
        symbolName: verifierAnchor.symbolName,
        symbolFilePath: verifierAnchor.symbolFilePath,
        resourceSeedPath: seedPath,
        mappedSeedTargets,
        resourceBindings,
        minimumEvidenceSatisfied: result.evidence_meta?.verifier_minimum_evidence_satisfied === true,
      });
      if (result.runtime_claim) {
        result.runtime_claim = adjustRuntimeClaimForPolicy({
          claim: result.runtime_claim,
          hydrationPolicy,
          fallbackToCompact: Boolean(result.hydrationMeta?.fallbackToCompact),
        });
      }
      if (
        result.runtime_claim?.reason === 'rule_matched_but_evidence_missing'
        && (!Array.isArray(result.runtime_claim.gaps) || result.runtime_claim.gaps.length === 0)
      ) {
        result.runtime_claim.gaps = [
          {
            segment: 'runtime',
            reason: 'missing verifier evidence',
            next_command: result.runtime_claim.next_action || `gitnexus query --repo "${repo.name}" --runtime-chain-verify on-demand`,
          },
        ];
      }
      if (result.runtime_claim) {
        result.runtime_chain = {
          status: result.runtime_claim.status,
          evidence_level: result.runtime_claim.evidence_level,
          hops: Array.isArray(result.runtime_claim.hops) ? result.runtime_claim.hops : [],
          gaps: Array.isArray(result.runtime_claim.gaps) ? result.runtime_claim.gaps : [],
        };
      }
    }

    if (responseProfile === 'full') {
      return result;
    }
    return buildSlimQueryResult(result, {
      repoName: repo.name,
      queryText: searchQuery,
    });
  }

  /**
   * BM25 keyword search helper - uses LadybugDB FTS for always-fresh results
   */
  private async bm25Search(repo: RepoHandle, query: string, limit: number, scopePreset?: string): Promise<any[]> {
    const { searchFTSFromLbug } = await import('../../core/search/bm25-index.js');
    const queryTokens = tokenizeQuery(query);
    let bm25Results;
    try {
      bm25Results = await searchFTSFromLbug(query, limit, repo.id);
    } catch (err: any) {
      logger.error(
        { err: err.message },
        'GitNexus: BM25/FTS search failed (FTS indexes may not exist) -',
      );
      return { results: [], ftsUsed: false };
    }

    bm25Results = filterBm25ResultsByScopePreset(bm25Results, scopePreset);
    const results: any[] = [];

    for (const bm25Result of bm25Results) {
      const fullPath = bm25Result.filePath;
      const adjustedScore = Number(bm25Result.score || 0) * getUnityPathScoreMultiplier(fullPath, queryTokens, scopePreset);
      try {
        const symbols = await executeParameterized(repo.id, `
          MATCH (n)
          WHERE n.filePath = $filePath
          RETURN n.id AS id, n.name AS name, labels(n)[0] AS type, n.filePath AS filePath, n.startLine AS startLine, n.endLine AS endLine
          LIMIT 50
        `, { filePath: fullPath });

        if (symbols.length > 0) {
          const rankedSymbols = rankExpandedSymbolsForQuery(
            symbols.map((sym) => ({
              id: sym.id || sym[0],
              name: sym.name || sym[1],
              type: sym.type || sym[2],
              filePath: sym.filePath || sym[3],
              startLine: sym.startLine || sym[4],
              endLine: sym.endLine || sym[5],
            })),
            query,
            3,
            scopePreset,
          );

          for (const sym of rankedSymbols) {
            results.push({
              nodeId: sym.id,
              name: sym.name,
              type: sym.type,
              filePath: sym.filePath,
              startLine: sym.startLine,
              endLine: sym.endLine,
              bm25Score: adjustedScore,
            });
          }
        } else {
          const fileName = fullPath.split('/').pop() || fullPath;
          results.push({
            name: fileName,
            type: 'File',
            filePath: bm25Result.filePath,
            bm25Score: adjustedScore,
          });
        }
      } catch {
        const fileName = fullPath.split('/').pop() || fullPath;
        results.push({
          name: fileName,
          type: 'File',
          filePath: bm25Result.filePath,
          bm25Score: adjustedScore,
        });
      }
    }

    return results.sort((a, b) => (Number(b.bm25Score || 0) - Number(a.bm25Score || 0)));
  }

  /**
   * Semantic vector search helper
   */
  private async semanticSearch(repo: RepoHandle, query: string, limit: number): Promise<any[]> {
    try {
      // Check if embedding table exists before loading the model (avoids heavy model init when embeddings are off)
      const tableCheck = await executeQuery(
        repo.id,
        `MATCH (e:${EMBEDDING_TABLE_NAME}) RETURN COUNT(*) AS cnt LIMIT 1`,
      );
      if (!tableCheck.length || (tableCheck[0].cnt ?? tableCheck[0][0]) === 0) return [];

      const { embedQuery, getEmbeddingDims } = await import('../core/embedder.js');
      const queryVec = await embedQuery(query);
      const dims = getEmbeddingDims();
      const queryVecStr = `[${queryVec.join(',')}]`;

      let bestChunks = new Map<
        string,
        { distance: number; chunkIndex: number; startLine: number; endLine: number }
      >();
      if (isVectorExtensionSupportedByPlatform()) {
        try {
          bestChunks = await collectBestChunks(limit, async (fetchLimit) => {
            const vectorQuery = `
            CALL QUERY_VECTOR_INDEX('${EMBEDDING_TABLE_NAME}', '${EMBEDDING_INDEX_NAME}',
              CAST(${queryVecStr} AS FLOAT[${dims}]), ${fetchLimit})
            YIELD node AS emb, distance
            WITH emb, distance
            WHERE distance < 0.6
            RETURN emb.nodeId AS nodeId, emb.chunkIndex AS chunkIndex,
                   emb.startLine AS startLine, emb.endLine AS endLine, distance
            ORDER BY distance
          `;

            const embResults = await executeQuery(repo.id, vectorQuery);
            return embResults.map((row) => ({
              nodeId: row.nodeId ?? row[0],
              chunkIndex: row.chunkIndex ?? row[1] ?? 0,
              startLine: row.startLine ?? row[2] ?? 0,
              endLine: row.endLine ?? row[3] ?? 0,
              distance: row.distance ?? row[4],
            }));
          });
        } catch {
          bestChunks = new Map();
        }
      } else if (!this.warnedVectorUnsupported) {
        // Rare diagnostic: surface why we fell back to the exact scan path so
        // operators can see at a glance that VECTOR is disabled by platform
        // policy. Emitted once per `LocalBackend` instance lifetime to avoid
        // noisy stderr on hot semantic-search paths (DoD §2.8).
        this.warnedVectorUnsupported = true;
        logger.warn(
          'GitNexus [query:vector]: VECTOR extension not supported on this platform; using exact scan fallback',
        );
      }

      if (bestChunks.size === 0) {
        const embeddingCount = Number(tableCheck[0].cnt ?? tableCheck[0][0] ?? 0);
        const exactLimit = getExactScanLimit();
        if (embeddingCount > exactLimit) return [];

        const rows = await executeQuery(
          repo.id,
          `
          MATCH (e:${EMBEDDING_TABLE_NAME})
          RETURN e.nodeId AS nodeId, e.chunkIndex AS chunkIndex,
                 e.startLine AS startLine, e.endLine AS endLine, e.embedding AS embedding
        `,
        );
        const exactRows: ExactEmbeddingRow[] = rows.map((row) => ({
          nodeId: row.nodeId ?? row[0],
          chunkIndex: row.chunkIndex ?? row[1] ?? 0,
          startLine: row.startLine ?? row[2] ?? 0,
          endLine: row.endLine ?? row[3] ?? 0,
          embedding: row.embedding ?? row[4] ?? [],
        }));
        bestChunks = new Map(
          rankExactEmbeddingRows(exactRows, queryVec, limit, 0.6).map((row) => [
            row.nodeId,
            {
              distance: row.distance,
              chunkIndex: row.chunkIndex,
              startLine: row.startLine,
              endLine: row.endLine,
            },
          ]),
        );
      }

      if (bestChunks.size === 0) return [];

      const results: any[] = [];

      for (const [nodeId, chunk] of Array.from(bestChunks.entries()).slice(0, limit)) {
        const labelEndIdx = nodeId.indexOf(':');
        const label = labelEndIdx > 0 ? nodeId.substring(0, labelEndIdx) : 'Unknown';

        // Validate label against known node types to prevent Cypher injection
        if (!VALID_NODE_LABELS.has(label)) continue;

        try {
          const nodeQuery =
            label === 'File'
              ? `MATCH (n:File {id: $nodeId}) RETURN n.name AS name, n.filePath AS filePath`
              : `MATCH (n:\`${label}\` {id: $nodeId}) RETURN n.name AS name, n.filePath AS filePath`;

          const nodeRows = await executeParameterized(repo.id, nodeQuery, { nodeId });
          if (nodeRows.length > 0) {
            const nodeRow = nodeRows[0];
            results.push({
              nodeId,
              name: nodeRow.name ?? nodeRow[0] ?? '',
              type: label,
              filePath: nodeRow.filePath ?? nodeRow[1] ?? '',
              distance: chunk.distance,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
            });
          }
        } catch {}
      }

      return results;
    } catch {
      // Expected when embeddings are disabled — silently fall back to BM25-only
      return [];
    }
  }

  async executeCypher(repoName: string, query: string): Promise<any> {
    const repo = await this.resolveRepo(repoName);
    return this.cypher(repo, { query });
  }

  private async cypher(repo: RepoHandle, params: { query: string }): Promise<any> {
    await this.ensureInitialized(repo.id);

    if (!isLbugReady(repo.id)) {
      return { error: 'LadybugDB not ready. Index may be corrupted.' };
    }

    // Block write operations (defense-in-depth — DB is already read-only)
    if (isWriteQuery(params.query)) {
      return {
        error:
          'Write operations (CREATE, DELETE, SET, MERGE, REMOVE, DROP, ALTER, COPY, DETACH) are not allowed. The knowledge graph is read-only.',
      };
    }

    try {
      const result = await executeQuery(repo.id, params.query);
      return result;
    } catch (err: any) {
      const msg = err.message || 'Query failed';
      if (isWalCorruptionError(err)) {
        return {
          error: msg,
          recoverySuggestion: WAL_RECOVERY_SUGGESTION,
        };
      }
      return { error: msg };
    }
  }

  /**
   * Format raw Cypher result rows as a markdown table for LLM readability.
   * Falls back to raw result if rows aren't tabular objects.
   */
  private formatCypherAsMarkdown(result: any): any {
    if (!Array.isArray(result) || result.length === 0) return result;

    const firstRow = result[0];
    if (typeof firstRow !== 'object' || firstRow === null) return result;

    const keys = Object.keys(firstRow);
    if (keys.length === 0) return result;

    const header = '| ' + keys.join(' | ') + ' |';
    const separator = '| ' + keys.map(() => '---').join(' | ') + ' |';
    const dataRows = result.map(
      (row: any) =>
        '| ' +
        keys
          .map((k) => {
            const v = row[k];
            if (v === null || v === undefined) return '';
            if (typeof v === 'object') return JSON.stringify(v);
            return String(v);
          })
          .join(' | ') +
        ' |',
    );

    return {
      markdown: [header, separator, ...dataRows].join('\n'),
      row_count: result.length,
    };
  }

  /**
   * Aggregate same-named clusters: group by heuristicLabel, sum symbols,
   * weighted-average cohesion, filter out tiny clusters (<5 symbols).
   * Raw communities stay intact in LadybugDB for Cypher queries.
   */
  private aggregateClusters(clusters: any[]): any[] {
    const groups = new Map<
      string,
      { ids: string[]; totalSymbols: number; weightedCohesion: number; largest: any }
    >();

    for (const c of clusters) {
      const label = c.heuristicLabel || c.label || 'Unknown';
      const symbols = c.symbolCount || 0;
      const cohesion = c.cohesion || 0;
      const existing = groups.get(label);

      if (!existing) {
        groups.set(label, {
          ids: [c.id],
          totalSymbols: symbols,
          weightedCohesion: cohesion * symbols,
          largest: c,
        });
      } else {
        existing.ids.push(c.id);
        existing.totalSymbols += symbols;
        existing.weightedCohesion += cohesion * symbols;
        if (symbols > (existing.largest.symbolCount || 0)) {
          existing.largest = c;
        }
      }
    }

    return Array.from(groups.entries())
      .map(([label, g]) => ({
        id: g.largest.id,
        label,
        heuristicLabel: label,
        symbolCount: g.totalSymbols,
        cohesion: g.totalSymbols > 0 ? g.weightedCohesion / g.totalSymbols : 0,
        subCommunities: g.ids.length,
      }))
      .filter((c) => c.symbolCount >= 5)
      .sort((a, b) => b.symbolCount - a.symbolCount);
  }

  private async overview(
    repo: RepoHandle,
    params: { showClusters?: boolean; showProcesses?: boolean; limit?: number },
  ): Promise<any> {
    await this.ensureInitialized(repo.id);

    const limit = params.limit || 20;
    const result: any = {
      repo: repo.name,
      repoPath: repo.repoPath,
      stats: repo.stats,
      indexedAt: repo.indexedAt,
      lastCommit: repo.lastCommit,
    };

    if (params.showClusters !== false) {
      try {
        // Fetch more raw communities than the display limit so aggregation has enough data
        const rawLimit = Math.max(limit * 5, 200);
        const clusters = await executeQuery(
          repo.id,
          `
          MATCH (c:Community)
          RETURN c.id AS id, c.label AS label, c.heuristicLabel AS heuristicLabel, c.cohesion AS cohesion, c.symbolCount AS symbolCount
          ORDER BY c.symbolCount DESC
          LIMIT ${rawLimit}
        `,
        );
        const rawClusters = clusters.map((c: any) => ({
          id: c.id || c[0],
          label: c.label || c[1],
          heuristicLabel: c.heuristicLabel || c[2],
          cohesion: c.cohesion || c[3],
          symbolCount: c.symbolCount || c[4],
        }));
        result.clusters = this.aggregateClusters(rawClusters).slice(0, limit);
      } catch {
        result.clusters = [];
      }
    }

    if (params.showProcesses !== false) {
      try {
        const processes = await executeQuery(
          repo.id,
          `
          MATCH (p:Process)
          RETURN p.id AS id, p.label AS label, p.heuristicLabel AS heuristicLabel, p.processType AS processType, p.stepCount AS stepCount
          ORDER BY p.stepCount DESC
          LIMIT ${limit}
        `,
        );
        result.processes = processes.map((p: any) => ({
          id: p.id || p[0],
          label: p.label || p[1],
          heuristicLabel: p.heuristicLabel || p[2],
          processType: p.processType || p[3],
          stepCount: p.stepCount || p[4],
        }));
      } catch {
        result.processes = [];
      }
    }

    return result;
  }

  /**
   * Patch the `type` field on candidates whose `labels(n)[0]` projection
   * came back empty — a known LadybugDB behaviour for several node types.
   *
   * Uses one scoped UNION query across the five priority labels rather
   * than per-candidate round-trips, so cost is a single DB call regardless
   * of how many candidates need enrichment. No-op when every candidate
   * already has a non-empty type.
   *
   * Failures are swallowed: label enrichment is an optimisation for
   * downstream scoring and #480 Class/Interface BFS seeding; if it fails
   * the symbol still resolves, just without the kind-priority bonus.
   */
  private async enrichCandidateLabels(
    repo: RepoHandle,
    candidates: Array<{ id: string; type: string }>,
  ): Promise<void> {
    const ids = candidates.filter((c) => c.type === '' && c.id).map((c) => c.id);
    if (ids.length === 0) return;
    try {
      const rows = await executeParameterized(
        repo.id,
        `
        MATCH (n:\`Class\`) WHERE n.id IN $ids RETURN n.id AS id, 'Class' AS label
        UNION ALL
        MATCH (n:\`Interface\`) WHERE n.id IN $ids RETURN n.id AS id, 'Interface' AS label
        UNION ALL
        MATCH (n:\`Function\`) WHERE n.id IN $ids RETURN n.id AS id, 'Function' AS label
        UNION ALL
        MATCH (n:\`Method\`) WHERE n.id IN $ids RETURN n.id AS id, 'Method' AS label
        UNION ALL
        MATCH (n:\`Constructor\`) WHERE n.id IN $ids RETURN n.id AS id, 'Constructor' AS label
        `,
        { ids },
      );
      const labelById = new Map<string, string>();
      for (const r of rows as any[]) {
        const id = (r.id ?? r[0]) as string;
        const label = (r.label ?? r[1]) as string;
        if (id && label && !labelById.has(id)) labelById.set(id, label);
      }
      for (const c of candidates) {
        if (c.type === '' && labelById.has(c.id)) c.type = labelById.get(c.id) as string;
      }
    } catch {
      /* best-effort — downstream resolvers still work without the label */
    }
  }

  /**
   * Score a symbol candidate for disambiguation ranking.
   *
   * Deterministic, no DB round-trip:
   *   - base 0.50
   *   - +0.40 when file_path hint matches (substring, case-insensitive)
   *   - +0.20 when kind hint exactly matches the candidate's kind
   *   - when no kind hint, a small priority bonus (Class > Interface >
   *     Function > Method > Constructor) to preserve the intuition that
   *     class-level names are usually what the user wanted.
   *
   * Capped at 1.0. Intentionally simple and inspectable — a future v2 can
   * plug in BM25/embedding signals here without changing the surrounding
   * resolver shape.
   */
  private scoreCandidate(
    c: { kind: string; filePath: string },
    hints: { file_path?: string; kind?: string },
  ): number {
    let s = 0.5;
    if (hints.file_path && c.filePath && typeof c.filePath === 'string') {
      if (c.filePath.toLowerCase().includes(hints.file_path.toLowerCase())) {
        s += 0.4;
      }
    }
    if (hints.kind && c.kind === hints.kind) {
      s += 0.2;
    }
    if (!hints.kind) {
      const priority: Record<string, number> = {
        Class: 5,
        Interface: 4,
        Function: 3,
        Method: 2,
        Constructor: 1,
      };
      s += (priority[c.kind] ?? 0) * 0.02;
    }
    return Math.min(1.0, s);
  }

  /**
   * Shared symbol resolver used by `context` and `impact`.
   *
   * Returns one of:
   *   - `{ kind: 'ok', symbol, resolvedLabel }` — single confident match
   *     (either direct UID, only one candidate after filtering, Class/
   *     Constructor collapse, or a top-scoring candidate with a clear gap
   *     to the runner-up).
   *   - `{ kind: 'ambiguous', candidates }` — multiple viable matches,
   *     sorted by score desc. Each candidate carries a relevance score.
   *   - `{ kind: 'not_found' }` — no matches at all.
   *
   * Preserves the #480 Class/Constructor preference: when the only
   * ambiguity is between a Class and its own Constructor (same name,
   * same filePath), the Class wins silently.
   */
  private async resolveSymbolCandidates(
    repo: RepoHandle,
    query: { uid?: string; name?: string; include_content?: boolean },
    hints: { file_path?: string; kind?: string },
  ): Promise<
    | {
        kind: 'ok';
        symbol: {
          id: string;
          name: string;
          type: string;
          filePath: string;
          startLine: number;
          endLine: number;
          content?: string;
        };
        resolvedLabel: string;
      }
    | {
        kind: 'ambiguous';
        candidates: Array<{
          id: string;
          name: string;
          type: string;
          filePath: string;
          startLine: number;
          endLine: number;
          score: number;
        }>;
      }
    | { kind: 'not_found' }
  > {
    const { uid, name, include_content } = query;
    const selectClause = `n.id AS id, n.name AS name, labels(n)[0] AS type, n.filePath AS filePath, n.startLine AS startLine, n.endLine AS endLine${include_content ? ', n.content AS content' : ''}`;

    // Direct UID — zero-ambiguity path.
    if (uid) {
      const rows = await executeParameterized(
        repo.id,
        `MATCH (n {id: $uid}) RETURN ${selectClause} LIMIT 1`,
        { uid },
      );
      if (rows.length === 0) return { kind: 'not_found' };
      const r = rows[0] as any;
      const symbol = {
        id: (r.id ?? r[0]) as string,
        name: (r.name ?? r[1]) as string,
        type: (r.type ?? r[2] ?? '') as string,
        filePath: (r.filePath ?? r[3]) as string,
        startLine: (r.startLine ?? r[4]) as number,
        endLine: (r.endLine ?? r[5]) as number,
        ...(include_content ? { content: (r.content ?? r[6]) as string | undefined } : {}),
      };
      // Same LadybugDB label-enrichment as the name-based path: a UID
      // pointing at a Class must still surface `type: 'Class'` so impact's
      // Class/Interface BFS seed fires. No-op when type is already set.
      await this.enrichCandidateLabels(repo, [symbol]);
      return { kind: 'ok', symbol, resolvedLabel: symbol.type };
    }

    if (!name) return { kind: 'not_found' };

    const isQualified = name.includes('/') || name.includes(':');
    let whereClause: string;
    const queryParams: Record<string, any> = { symName: name };
    if (hints.file_path) {
      whereClause = `WHERE n.name = $symName AND n.filePath CONTAINS $filePath`;
      queryParams.filePath = hints.file_path;
    } else if (isQualified) {
      whereClause = `WHERE n.id = $symName OR n.name = $symName`;
    } else {
      whereClause = `WHERE n.name = $symName`;
    }

    // LIMIT 20 (was 10) — scoring is the point now, so give the ranker
    // headroom instead of arbitrary truncation.
    const rows = await executeParameterized(
      repo.id,
      `MATCH (n) ${whereClause} RETURN ${selectClause} LIMIT 20`,
      queryParams,
    );

    if (rows.length === 0) return { kind: 'not_found' };

    // Normalise row shape across object / tuple returns from LadybugDB.
    const normalized = rows.map((r: any) => ({
      id: (r.id ?? r[0]) as string,
      name: (r.name ?? r[1]) as string,
      type: (r.type ?? r[2] ?? '') as string,
      filePath: (r.filePath ?? r[3]) as string,
      startLine: (r.startLine ?? r[4]) as number,
      endLine: (r.endLine ?? r[5]) as number,
      ...(include_content ? { content: (r.content ?? r[6]) as string | undefined } : {}),
    }));

    // Enrich labels for any candidates where `labels(n)[0]` came back empty.
    // LadybugDB returns an empty string for that projection on certain node
    // types (notably Class), which left downstream consumers (impact's
    // Class/Interface BFS seed, the kind-priority scoring bonus) unable to
    // distinguish a Class target from "unknown kind". One scoped UNION
    // across the five priority labels patches the type in-place without
    // per-candidate round-trips.
    await this.enrichCandidateLabels(repo, normalized);

    // Preserve #480 Class/Constructor collapse: if we have exactly one
    // Class (or Interface) candidate and one Constructor sharing name +
    // filePath, fold into the Class. This used to require a follow-up
    // label query because LadybugDB sometimes returns an empty labels()[0]
    // for Class nodes — enrichment above handles the empty-type case, but
    // the `type === 'Constructor'` gate still correctly triggers when a
    // Class and its Constructor share the name.
    if (!hints.kind && normalized.length > 1) {
      const ambiguousType = normalized.some((s) => s.type === '' || s.type === 'Constructor');
      if (ambiguousType) {
        const candidateIds = normalized.map((s) => s.id).filter(Boolean);
        for (const label of ['Class', 'Interface']) {
          const labelRows = await executeParameterized(
            repo.id,
            `MATCH (n:\`${label}\`) WHERE n.id IN $candidateIds RETURN n.id AS id LIMIT 1`,
            { candidateIds },
          ).catch(() => []);
          if (labelRows.length > 0) {
            const preferredId = (labelRows[0] as any).id ?? (labelRows[0] as any)[0];
            const preferred = normalized.find((s) => s.id === preferredId);
            if (preferred) {
              return {
                kind: 'ok',
                symbol: preferred,
                resolvedLabel: label,
              };
            }
          }
        }
      }
    }

    if (normalized.length === 1) {
      return {
        kind: 'ok',
        symbol: normalized[0],
        resolvedLabel: '',
      };
    }

    // Score, sort desc, stable tiebreak on shorter filePath then lex uid.
    const scored = normalized.map((s) => ({
      ...s,
      score: this.scoreCandidate({ kind: s.type, filePath: s.filePath || '' }, hints),
    }));
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const fpA = (a.filePath || '').length;
      const fpB = (b.filePath || '').length;
      if (fpA !== fpB) return fpA - fpB;
      return String(a.id).localeCompare(String(b.id));
    });

    // Confident single-result: top score ≥ 0.95 AND beats runner-up by a
    // clear margin. This lets a very strong file_path/kind hint resolve
    // cleanly instead of forcing the caller through a disambiguation
    // round-trip.
    //
    // The gap threshold uses `> 0.09` rather than `>= 0.10` on purpose:
    // IEEE754 addition of the scoring terms (0.50 + 0.40 + 0.20 - 0.90
    // yields 0.09999999999999998, not exactly 0.10) would otherwise break
    // the comparison for legitimate "top is 1.00, runner is 0.90" cases.
    // The intent is a clearly-dominant winner; 0.09 is a large enough
    // margin to mean that unambiguously.
    //
    // The `scored.length >= 2` guard is defensive. The `normalized.length === 1`
    // early return above already handles the single-candidate path, so in
    // practice `scored` always has at least two elements by the time we get
    // here — keeping the guard means changes to the upstream early-return
    // logic cannot accidentally index out of bounds at `scored[1]`.
    if (scored.length >= 2 && scored[0].score >= 0.95 && scored[0].score - scored[1].score > 0.09) {
      return { kind: 'ok', symbol: scored[0], resolvedLabel: scored[0].type };
    }

    return { kind: 'ambiguous', candidates: scored };
  }

  /**
   * Context tool — 360-degree symbol view with categorized refs.
   * Disambiguation (ranked) when multiple symbols share a name.
   * UID-based direct lookup. No cluster in output.
   */
  private async context(repo: RepoHandle, params: {
    name?: string;
    uid?: string;
    file_path?: string;
    include_content?: boolean;
    unity_resources?: string;
    unity_hydration_mode?: string;
    unity_evidence_mode?: string;
    hydration_policy?: string;
    resource_path_prefix?: string;
    binding_kind?: string;
    max_bindings?: number;
    max_reference_fields?: number;
    resource_seed_mode?: string;
    runtime_chain_verify?: string;
    response_profile?: string;
  }): Promise<any> {
    await this.ensureInitialized(repo.id);
    
    const { name, uid, file_path, include_content } = params;
    const runtimeChainVerifyMode = String(params.runtime_chain_verify || 'off').trim().toLowerCase() as RuntimeChainVerifyMode;
    const responseProfile = resolveResponseProfile(params.response_profile);
    const confidenceFieldsEnabled = true;
    let unityResourcesMode: 'off' | 'on' | 'auto' = 'off';
    let unityHydrationMode: 'compact' | 'parity' = 'compact';
    let unityEvidenceMode: 'summary' | 'focused' | 'full' = 'summary';
    let hydrationPolicy: 'fast' | 'balanced' | 'strict' = 'balanced';
    let resourceSeedMode: ResourceSeedMode = 'balanced';
    try {
      unityResourcesMode = parseUnityResourcesMode(params.unity_resources);
      unityHydrationMode = parseUnityHydrationMode(params.unity_hydration_mode);
      unityEvidenceMode = parseUnityEvidenceMode(params.unity_evidence_mode);
      hydrationPolicy = parseHydrationPolicy(params.hydration_policy);
      resourceSeedMode = parseResourceSeedMode(params.resource_seed_mode);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
    const evidenceMaxBindings = Number.isFinite(Number(params.max_bindings))
      ? Number(params.max_bindings)
      : undefined;
    const evidenceMaxReferenceFields = Number.isFinite(Number(params.max_reference_fields))
      ? Number(params.max_reference_fields)
      : undefined;
    const evidenceResourcePathPrefix = String(params.resource_path_prefix || '').trim() || undefined;
    const seedPath = resolveSeedPath({
      resourcePathPrefix: evidenceResourcePathPrefix,
      filePath: file_path,
      queryText: name,
    });
    const evidenceBindingKind = String(params.binding_kind || '').trim() || undefined;
    let mappedSeedTargets: string[] = [];
    if (seedPath) {
      try {
        const seedRows = await executeParameterized(repo.id, `
          MATCH (:File {filePath: $seedPath})-[r:CodeRelation {type: 'UNITY_ASSET_GUID_REF'}]->(target:File)
          RETURN DISTINCT target.filePath AS targetPath, r.reason AS relationReason
          LIMIT 100
        `, { seedPath });
        const candidates: SeedTargetCandidate[] = seedRows
          .map((row: any) => {
            const targetPath = normalizePath(String(row?.targetPath || row?.[0] || '').trim());
            const parsedReason = parseSeedRelationReason(row?.relationReason);
            return {
              targetPath,
              fieldName: parsedReason.fieldName,
              sourceLayer: parsedReason.sourceLayer,
            };
          })
          .filter((row) => row.targetPath.length > 0);
        mappedSeedTargets = rankSeedTargetCandidates(seedPath, candidates);
      } catch (e) {
        logQueryError('context:seed-mapped-targets', e);
      }
      if (mappedSeedTargets.length === 0) {
        mappedSeedTargets = rankSeedTargetCandidates(
          seedPath,
          (await resolveSeedTargetsFromResourceFile(repo.repoPath, seedPath)).map((targetPath) => ({ targetPath })),
        );
      }
    }
    
    if (!name && !uid) {
      return { error: 'Either "name" or "uid" parameter is required.' };
    }

    const outcome = await this.resolveSymbolCandidates(
      repo,
      { uid, name, include_content },
      { file_path, kind },
    );

    if (outcome.kind === 'not_found') {
      return { error: `Symbol '${name || uid}' not found` };
    }

    if (outcome.kind === 'ambiguous') {
      return {
        status: 'ambiguous',
        message: `Found ${outcome.candidates.length} symbols matching '${name}'. Use uid, file_path, or kind to disambiguate.`,
        candidates: outcome.candidates.map((c) => ({
          uid: c.id,
          name: c.name,
          kind: c.type,
          filePath: c.filePath,
          line: c.startLine,
          score: Number(c.score.toFixed(2)),
        })),
      };
    }

    // Step 3: Build full context
    const sym = symbols[0];
    const symId = sym.id || sym[0];
    const symNodeId = String(symId || '');
    const symName = String(sym.name || sym[1] || '');
    const symFilePath = String(sym.filePath || sym[3] || '');

    // Direct incoming refs for the selected symbol.
    const directIncomingRows = await executeParameterized(repo.id, `
      MATCH (caller)-[r:CodeRelation]->(n {id: $symId})
      WHERE r.type IN ['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS', 'HAS_METHOD', 'HAS_PROPERTY', 'METHOD_OVERRIDES', 'OVERRIDES', 'METHOD_IMPLEMENTS', 'ACCESSES']
      RETURN r.type AS relType, caller.id AS uid, caller.name AS name, caller.filePath AS filePath, labels(caller)[0] AS kind
      LIMIT 30
    `,
      { symId },
    );

    // Fix #480: Class/Interface nodes have no direct CALLS/IMPORTS edges —
    // those point to Constructor and File nodes respectively. Fetch those
    // extra incoming refs and merge them in so context() shows real callers.
    //
    // Determine if this is a Class/Interface node. If resolvedLabel was set
    // during disambiguation (Step 2), use it directly — no extra round-trip.
    // Otherwise fall back to a single label check only when the type field is
    // empty (LadybugDB labels(n)[0] limitation).
    const symRawType = sym.type || sym[2] || '';
    let isClassLike = resolvedLabel === 'Class' || resolvedLabel === 'Interface';
    if (!isClassLike && symRawType === '') {
      try {
        // Single UNION query instead of two serial round-trips.
        const typeCheck = await executeParameterized(
          repo.id,
          `
          MATCH (n:Class) WHERE n.id = $symId RETURN 'Class' AS label LIMIT 1
          UNION ALL
          MATCH (n:Interface) WHERE n.id = $symId RETURN 'Interface' AS label LIMIT 1
        `,
          { symId },
        );
        isClassLike = typeCheck.length > 0;
      } catch {
        /* not a Class/Interface node */
      }
    } else if (!isClassLike) {
      isClassLike = symRawType === 'Class' || symRawType === 'Interface';
    }

    if (isClassLike) {
      try {
        // Run both incoming-ref queries in parallel — they are independent.
        const [ctorIncoming, fileIncoming] = await Promise.all([
          executeParameterized(
            repo.id,
            `
            MATCH (n)-[hm:CodeRelation]->(ctor:Constructor)
            WHERE n.id = $symId AND hm.type = 'HAS_METHOD'
            MATCH (caller)-[r:CodeRelation]->(ctor)
            WHERE r.type IN ['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS', 'ACCESSES']
            RETURN r.type AS relType, caller.id AS uid, caller.name AS name, caller.filePath AS filePath, labels(caller)[0] AS kind
            LIMIT 30
          `,
            { symId },
          ),
          executeParameterized(
            repo.id,
            `
            MATCH (f:File)-[rel:CodeRelation]->(n)
            WHERE n.id = $symId AND rel.type = 'DEFINES'
            MATCH (caller)-[r:CodeRelation]->(f)
            WHERE r.type IN ['CALLS', 'IMPORTS']
            RETURN r.type AS relType, caller.id AS uid, caller.name AS name, caller.filePath AS filePath, labels(caller)[0] AS kind
            LIMIT 30
          `,
            { symId },
          ),
        ]);

        // Deduplicate by (relType, uid) — a caller can have multiple relation
        // types to the same target (e.g. both IMPORTS and CALLS), and each
        // must be preserved so every category appears in the output.
        const seenKeys = new Set(
          incomingRows.map((r: any) => `${r.relType || r[0]}:${r.uid || r[1]}`),
        );
        for (const r of [...ctorIncoming, ...fileIncoming]) {
          const key = `${r.relType || r[0]}:${r.uid || r[1]}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            incomingRows.push(r);
          }
        }
      } catch (e) {
        logQueryError('context:class-incoming-expansion', e);
      }
    }

    // Direct outgoing refs for the selected symbol.
    const directOutgoingRows = await executeParameterized(repo.id, `
      MATCH (n {id: $symId})-[r:CodeRelation]->(target)
      WHERE r.type IN ['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS', 'HAS_METHOD', 'HAS_PROPERTY', 'METHOD_OVERRIDES', 'OVERRIDES', 'METHOD_IMPLEMENTS', 'ACCESSES']
      RETURN r.type AS relType, target.id AS uid, target.name AS name, target.filePath AS filePath, labels(target)[0] AS kind
      LIMIT 30
    `,
      { symId },
    );

    const kind = sym.type || sym[2];
    const symIdLower = String(symId).toLowerCase();
    const isMethodContainer = new Set(['Class', 'Interface', 'Struct', 'Trait', 'Impl', 'Record']).has(kind)
      || symIdLower.startsWith('class:')
      || symIdLower.startsWith('interface:')
      || symIdLower.startsWith('struct:')
      || symIdLower.startsWith('trait:')
      || symIdLower.startsWith('impl:')
      || symIdLower.startsWith('record:');
    let incomingRows = [...directIncomingRows];
    let outgoingRows = [...directOutgoingRows];

    if (isMethodContainer) {
      const methodIncomingRows = await executeParameterized(repo.id, `
        MATCH (n {id: $symId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)
        MATCH (caller)-[r:CodeRelation]->(m)
        WHERE r.type IN ['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS']
        RETURN r.type AS relType, caller.id AS uid, caller.name AS name, caller.filePath AS filePath, labels(caller)[0] AS kind
        LIMIT 60
      `, { symId });

      const methodOutgoingRows = await executeParameterized(repo.id, `
        MATCH (n {id: $symId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)
        MATCH (m)-[r:CodeRelation]->(target)
        WHERE r.type IN ['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS']
        RETURN r.type AS relType, target.id AS uid, target.name AS name, target.filePath AS filePath, labels(target)[0] AS kind
        LIMIT 60
      `, { symId });

      const dedupe = (rows: any[]) => {
        const seen = new Set<string>();
        const out: any[] = [];
        for (const row of rows) {
          const relType = row.relType || row[0] || '';
          const uidVal = row.uid || row[1] || '';
          const key = `${relType}:${uidVal}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(row);
        }
        return out;
      };

      incomingRows = dedupe([...directIncomingRows, ...methodIncomingRows]);
      outgoingRows = dedupe([...directOutgoingRows, ...methodOutgoingRows]);
    }

    // Process participation with class-level method projection.
    let directProcessRows: any[] = [];
    let projectedProcessRows: any[] = [];
    try {
      directProcessRows = await executeParameterized(repo.id, `
        MATCH (n {id: $symId})-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process)
        RETURN p.id AS pid, p.heuristicLabel AS label, p.processSubtype AS processSubtype, p.runtimeChainConfidence AS runtimeChainConfidence, r.step AS step, p.stepCount AS stepCount
      `, { symId });
    } catch (e) { logQueryError('context:process-participation', e); }

    if (isMethodContainer) {
      try {
        projectedProcessRows = await executeParameterized(repo.id, `
          MATCH (n {id: $symId})-[:CodeRelation {type: 'HAS_METHOD'}]->(m)
          MATCH (m)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process)
          RETURN p.id AS pid, p.heuristicLabel AS label, p.processSubtype AS processSubtype, p.runtimeChainConfidence AS runtimeChainConfidence, MIN(r.step) AS step, p.stepCount AS stepCount
        `, { symId });
      } catch (e) { logQueryError('context:method-process-projection', e); }
    }

    let processRows = mergeProcessEvidence({
      directRows: directProcessRows,
      projectedRows: projectedProcessRows,
    });
    
    // Helper to categorize refs
    const categorize = (rows: any[]) => {
      const cats: Record<string, any[]> = {};
      for (const row of rows) {
        const relType = (row.relType || row[0] || '').toLowerCase();
        const entry = {
          uid: row.uid || row[1],
          name: row.name || row[2],
          filePath: row.filePath || row[3],
          kind: row.kind || row[4],
        };
        if (!cats[relType]) cats[relType] = [];
        cats[relType].push(entry);
      }
      return cats;
    };
    
    const result: any = {
      status: 'found',
      symbol: {
        uid: sym.id || sym[0],
        name: symName,
        kind,
        filePath: symFilePath,
        startLine: sym.startLine || sym[4],
        endLine: sym.endLine || sym[5],
        ...(include_content && (sym.content || sym[6]) ? { content: sym.content || sym[6] } : {}),
        ...(methodMetadata ? { methodMetadata } : {}),
      },
      incoming: categorize(incomingRows),
      outgoing: categorize(outgoingRows),
      directIncoming: categorize(directIncomingRows),
      directOutgoing: categorize(directOutgoingRows),
      processes: [] as any[],
    };

    if (unityResourcesMode !== 'off' && symNodeId && (kind === 'Class' || symNodeId.toLowerCase().startsWith('class:'))) {
      const unityContext = await loadUnityContext(repo.id, symNodeId, (query) => executeQuery(repo.id, query));
      const hydrationDecision = resolveHydrationModeDecision({
        hydrationPolicy,
        unityHydrationMode,
      });
      let hydrationReason = hydrationDecision.reason;
      let hydratedUnityContext = await hydrateUnityForSymbol({
        mode: hydrationDecision.requestedMode,
        basePayload: unityContext,
        deps: {
          executeQuery: (query, queryParams) => {
            if (queryParams && Object.keys(queryParams).length > 0) {
              return executeParameterized(repo.id, query, queryParams);
            }
            return executeQuery(repo.id, query);
          },
          repoPath: repo.repoPath,
          storagePath: repo.storagePath,
          indexedCommit: repo.lastCommit,
        },
        symbol: {
          uid: symNodeId,
          name: symName,
          filePath: symFilePath,
        },
      });
      const firstMissingEvidence = buildMissingEvidenceFromHydrationMeta(hydratedUnityContext.hydrationMeta);
      if (hydrationPolicy === 'balanced' && firstMissingEvidence.length > 0 && hydratedUnityContext.hydrationMeta?.needsParityRetry) {
        hydratedUnityContext = await hydrateUnityForSymbol({
          mode: 'parity',
          basePayload: unityContext,
          deps: {
            executeQuery: (query, queryParams) => {
              if (queryParams && Object.keys(queryParams).length > 0) {
                return executeParameterized(repo.id, query, queryParams);
              }
              return executeQuery(repo.id, query);
            },
            repoPath: repo.repoPath,
            storagePath: repo.storagePath,
            indexedCommit: repo.lastCommit,
          },
          symbol: {
            uid: symNodeId,
            name: symName,
            filePath: symFilePath,
          },
        });
        hydrationReason = 'hydration_policy_balanced_escalated_to_parity_on_missing_evidence';
      }
      if (hydratedUnityContext.hydrationMeta?.fallbackToCompact) {
        hydrationReason = `${hydrationReason}+fallback_to_compact`;
      }
      hydratedUnityContext = withHydrationDecisionMeta({
        payload: hydratedUnityContext,
        requestedMode: hydrationDecision.requestedMode,
        reason: hydrationReason,
      });
      const finalMissingEvidence = buildMissingEvidenceFromHydrationMeta(hydratedUnityContext.hydrationMeta);
      Object.assign(result, hydratedUnityContext);
      (result as any).missing_evidence = hydrationPolicy === 'balanced'
        ? [...new Set([...firstMissingEvidence, ...finalMissingEvidence])]
        : finalMissingEvidence;
      if (Array.isArray((result as any).resourceBindings) && (result as any).resourceBindings.length > 0) {
        const evidenceView = buildUnityEvidenceView({
          resourceBindings: (result as any).resourceBindings,
          mode: unityEvidenceMode,
          scopePreset: undefined,
          resourcePathPrefix: evidenceResourcePathPrefix,
          bindingKind: evidenceBindingKind,
          maxBindings: evidenceMaxBindings,
          maxReferenceFields: evidenceMaxReferenceFields,
        });
        (result as any).resourceBindings = evidenceView.resourceBindings;
        (result as any).serializedFields = evidenceView.serializedFields;
        (result as any).evidence_meta = evidenceView.evidence_meta;
        if (evidenceView.filter_diagnostics.length > 0) {
          (result as any).filter_diagnostics = evidenceView.filter_diagnostics;
        }
      }

    }

    result.processes = processRows.map((r: any) => {
      const rawPid = String(r.pid || r[0] || '');
      const process_ref = buildProcessRef({
        repoName: repo.name,
        processId: rawPid,
        origin: toProcessRefOrigin(r.evidence_mode),
        indexedCommit: String(repo.lastCommit || 'unknown_commit'),
        symbolUid: String(symNodeId || ''),
        evidenceFingerprint: deriveEvidenceFingerprint(
          { nodeId: symNodeId, filePath: symFilePath, startLine: sym.startLine || sym[4], endLine: sym.endLine || sym[5] },
          {
            pid: rawPid,
            processSubtype: r.processSubtype || r[2] || '',
            evidenceMode: r.evidence_mode,
            step: r.step || r[4] || 0,
            stepCount: r.stepCount || r[5] || 0,
          },
          Array.isArray((result as any).resourceBindings)
            ? (result as any).resourceBindings.map((binding: any) => ({
              resourcePath: binding.resourcePath,
              bindingKind: binding.bindingKind,
              componentObjectId: binding.componentObjectId,
            }))
            : [],
        ),
      });

      return {
        id: process_ref.id,
        process_ref,
        name: r.label || r[1],
        process_subtype: r.processSubtype || r[2],
        step_index: r.step || r[4],
        step_count: r.stepCount || r[5],
        evidence_mode: r.evidence_mode,
        confidence: r.confidence,
        ...(confidenceFieldsEnabled ? {
          runtime_chain_confidence: r.confidence,
          runtime_chain_evidence_level: r.runtime_chain_evidence_level,
          verification_hint: r.verification_hint,
        } : {}),
      };
    });
    const topVerificationHint = result.processes.find((row: any) => row?.verification_hint)?.verification_hint;
    const contextResourceBindings = Array.isArray((result as any).resourceBindings) ? (result as any).resourceBindings : [];
    if (unityResourcesMode !== 'off' && seedPath) {
      result.resource_chains = await loadSeedUnityResourceChains({
        repoId: repo.id,
        seedPath,
        targetSymbols: [{
          id: symNodeId,
          name: symName,
          filePath: symFilePath,
          requireExact: true,
        }],
      });
    }
    const retrievalRule = await resolveRetrievalRuleHint({
      repoPath: repo.repoPath,
      queryText: name,
      symbolName: symName || String(name || uid || ''),
      seedPath,
    });
    result.next_hops = buildNextHops({
      seedPath,
      mappedSeedTargets,
      resourceBindings: contextResourceBindings,
      verificationHint: topVerificationHint,
      retrievalRule,
      repoName: repo.name,
      symbolName: symName || String(name || uid || ''),
      queryForSymbol: symName || String(name || uid || ''),
    });
    const contextStrictAnchorMode = Boolean(uid || file_path || evidenceResourcePathPrefix);
    result.decision_context = {
      strict_anchor_mode: contextStrictAnchorMode,
      anchor_symbol_name: symName || String(name || uid || ''),
      anchor_resource_path: evidenceResourcePathPrefix || seedPath || mappedSeedTargets[0] || null,
    };

    if (runtimeChainVerifyMode === 'on-demand') {
      result.runtime_claim = await verifyRuntimeClaimOnDemand({
        repoPath: repo.repoPath,
        executeParameterized: (query, queryParams) => executeParameterized(repo.id, query, queryParams || {}),
        queryText: name || symName || uid || seedPath,
        symbolName: symName,
        symbolFilePath: symFilePath,
        resourceSeedPath: seedPath,
        mappedSeedTargets,
        resourceBindings: Array.isArray((result as any).resourceBindings) ? (result as any).resourceBindings : [],
        minimumEvidenceSatisfied: (result as any).evidence_meta?.verifier_minimum_evidence_satisfied === true,
      });
      if (result.runtime_claim) {
        result.runtime_claim = adjustRuntimeClaimForPolicy({
          claim: result.runtime_claim,
          hydrationPolicy,
          fallbackToCompact: Boolean(result.hydrationMeta?.fallbackToCompact),
        });
      }
      if (
        result.runtime_claim?.reason === 'rule_matched_but_evidence_missing'
        && (!Array.isArray(result.runtime_claim.gaps) || result.runtime_claim.gaps.length === 0)
      ) {
        result.runtime_claim.gaps = [
          {
            segment: 'runtime',
            reason: 'missing verifier evidence',
            next_command: result.runtime_claim.next_action || `gitnexus context --repo "${repo.name}" --runtime-chain-verify on-demand`,
          },
        ];
      }
      if (result.runtime_claim) {
        result.runtime_chain = {
          status: result.runtime_claim.status,
          evidence_level: result.runtime_claim.evidence_level,
          hops: Array.isArray(result.runtime_claim.hops) ? result.runtime_claim.hops : [],
          gaps: Array.isArray(result.runtime_claim.gaps) ? result.runtime_claim.gaps : [],
        };
      }
    }

    if (responseProfile === 'full') {
      return result;
    }
    return buildSlimContextResult(result, {
      repoName: repo.name,
      symbolName: symName || String(name || uid || ''),
    });
  }

  /**
   * Legacy explore — kept for backwards compatibility with resources.ts.
   * Routes cluster/process types to direct graph queries.
   */
  private async explore(
    repo: RepoHandle,
    params: { name: string; type: 'symbol' | 'cluster' | 'process' },
  ): Promise<any> {
    await this.ensureInitialized(repo.id);
    const { name, type } = params;

    if (type === 'symbol') {
      return this.context(repo, { name });
    }

    if (type === 'cluster') {
      const clusters = await executeParameterized(
        repo.id,
        `
        MATCH (c:Community)
        WHERE c.label = $clusterName OR c.heuristicLabel = $clusterName
        RETURN c.id AS id, c.label AS label, c.heuristicLabel AS heuristicLabel, c.cohesion AS cohesion, c.symbolCount AS symbolCount
      `,
        { clusterName: name },
      );
      if (clusters.length === 0) return { error: `Cluster '${name}' not found` };

      const rawClusters = clusters.map((c: any) => ({
        id: c.id || c[0],
        label: c.label || c[1],
        heuristicLabel: c.heuristicLabel || c[2],
        cohesion: c.cohesion || c[3],
        symbolCount: c.symbolCount || c[4],
      }));

      let totalSymbols = 0,
        weightedCohesion = 0;
      for (const c of rawClusters) {
        const s = c.symbolCount || 0;
        totalSymbols += s;
        weightedCohesion += (c.cohesion || 0) * s;
      }

      const members = await executeParameterized(
        repo.id,
        `
        MATCH (n)-[:CodeRelation {type: 'MEMBER_OF'}]->(c:Community)
        WHERE c.label = $clusterName OR c.heuristicLabel = $clusterName
        RETURN DISTINCT n.name AS name, labels(n)[0] AS type, n.filePath AS filePath
        LIMIT 30
      `,
        { clusterName: name },
      );

      return {
        cluster: {
          id: rawClusters[0].id,
          label: rawClusters[0].heuristicLabel || rawClusters[0].label,
          heuristicLabel: rawClusters[0].heuristicLabel || rawClusters[0].label,
          cohesion: totalSymbols > 0 ? weightedCohesion / totalSymbols : 0,
          symbolCount: totalSymbols,
          subCommunities: rawClusters.length,
        },
        members: members.map((m: any) => ({
          name: m.name || m[0],
          type: m.type || m[1],
          filePath: m.filePath || m[2],
        })),
      };
    }

    if (type === 'process') {
      const processes = await executeParameterized(
        repo.id,
        `
        MATCH (p:Process)
        WHERE p.label = $processName OR p.heuristicLabel = $processName
        RETURN p.id AS id, p.label AS label, p.heuristicLabel AS heuristicLabel, p.processType AS processType, p.processSubtype AS processSubtype, p.runtimeChainConfidence AS runtimeChainConfidence, p.stepCount AS stepCount
        LIMIT 1
      `,
        { processName: name },
      );
      if (processes.length === 0) return { error: `Process '${name}' not found` };

      const proc = processes[0];
      const procId = proc.id || proc[0];
      const steps = await executeParameterized(
        repo.id,
        `
        MATCH (n)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p {id: $procId})
        RETURN n.name AS name, labels(n)[0] AS type, n.filePath AS filePath, r.step AS step, r.reason AS reason, r.confidence AS confidence
        ORDER BY r.step
      `,
        { procId },
      );

      return {
        process: {
          id: procId, label: proc.label || proc[1], heuristicLabel: proc.heuristicLabel || proc[2],
          processType: proc.processType || proc[3],
          processSubtype: proc.processSubtype || proc[4],
          runtimeChainConfidence: proc.runtimeChainConfidence || proc[5],
          stepCount: proc.stepCount || proc[6],
        },
        steps: steps.map((s: any) => ({
          step: s.step || s[3],
          reason: s.reason || s[4],
          confidence: s.confidence || s[5],
          name: s.name || s[0],
          type: s.type || s[1],
          filePath: s.filePath || s[2],
        })),
      };
    }

    return { error: 'Invalid type. Use: symbol, cluster, or process' };
  }

  /**
   * Detect changes — git-diff based impact analysis.
   * Maps changed lines to indexed symbols, then finds affected processes.
   */
  private async detectChanges(
    repo: RepoHandle,
    params: {
      scope?: string;
      base_ref?: string;
    },
  ): Promise<any> {
    await this.ensureInitialized(repo.id);

    const scope = params.scope || 'unstaged';
    const { execFileSync } = await import('child_process');

    // Build git diff args based on scope (using execFileSync to avoid shell injection)
    let diffArgs: string[];
    switch (scope) {
      case 'staged':
        diffArgs = ['diff', '--staged', '-U0'];
        break;
      case 'all':
        diffArgs = ['diff', 'HEAD', '-U0'];
        break;
      case 'compare':
        if (!params.base_ref) return { error: 'base_ref is required for "compare" scope' };
        diffArgs = ['diff', params.base_ref, '-U0'];
        break;
      case 'unstaged':
      default:
        diffArgs = ['diff', '-U0'];
        break;
    }

    let diffOutput: string;
    try {
      // maxBuffer raised from Node's 1MB default to 256MB to avoid ENOBUFS on
      // repos with large unstaged/untracked diffs (e.g. unignored build folders).
      // See issue: spawnSync git ENOBUFS in detect_changes(scope="unstaged").
      diffOutput = execFileSync('git', diffArgs, {
        cwd: repo.repoPath,
        encoding: 'utf-8',
        maxBuffer: 256 * 1024 * 1024,
      });
    } catch (err: any) {
      return { error: `Git diff failed: ${err.message}` };
    }

    const fileDiffs: FileDiff[] = parseDiffHunks(diffOutput);

    if (fileDiffs.length === 0) {
      return {
        summary: {
          changed_count: 0,
          affected_count: 0,
          risk_level: 'none',
          message: 'No changes detected.',
        },
        changed_symbols: [],
        affected_processes: [],
      };
    }

    // Map diff hunks to indexed symbols via range overlap
    const changedSymbols: any[] = [];
    for (const fileDiff of fileDiffs) {
      if (fileDiff.hunks.length === 0) continue;

      // Build range overlap conditions for all hunks in this file
      const overlapConditions = fileDiff.hunks
        .map((_, i) => `(n.startLine <= $hunkEnd${i} AND n.endLine >= $hunkStart${i})`)
        .join(' OR ');

      const queryParams: Record<string, any> = { filePath: fileDiff.filePath };
      fileDiff.hunks.forEach((hunk, i) => {
        queryParams[`hunkStart${i}`] = hunk.startLine;
        queryParams[`hunkEnd${i}`] = hunk.endLine;
      });

      const symbolQuery = `
        MATCH (n) WHERE n.filePath ENDS WITH $filePath
          AND n.startLine IS NOT NULL AND n.endLine IS NOT NULL
          AND (${overlapConditions})
        RETURN n.id AS id, n.name AS name, labels(n)[0] AS type,
               n.filePath AS filePath, n.startLine AS startLine, n.endLine AS endLine
      `;

      try {
        const rows = await executeParameterized(repo.id, symbolQuery, queryParams);
        for (const sym of rows) {
          changedSymbols.push({
            id: sym.id || sym[0],
            name: sym.name || sym[1],
            type: sym.type || sym[2],
            filePath: sym.filePath || sym[3],
            change_type: 'touched',
          });
        }
      } catch (e) {
        logQueryError('detect-changes:file-symbols', e);
      }
    }

    // Find affected processes -- single batched query instead of N+1
    const affectedProcesses = new Map<string, any>();
    if (changedSymbols.length > 0) {
      const symIds = changedSymbols.map((s) => s.id);
      const symNameById = new Map(changedSymbols.map((s) => [s.id, s.name]));
      try {
        const procs = await executeParameterized(
          repo.id,
          `
          MATCH (n)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process)
          WHERE n.id IN $ids
          RETURN n.id AS nodeId, p.id AS pid, p.heuristicLabel AS label,
                 p.processType AS processType, p.stepCount AS stepCount, r.step AS step
        `,
          { ids: symIds },
        );
        for (const proc of procs) {
          const nodeId = proc.nodeId || proc[0];
          const pid = proc.pid || proc[1];
          if (!affectedProcesses.has(pid)) {
            affectedProcesses.set(pid, {
              id: pid,
              name: proc.label || proc[2],
              process_type: proc.processType || proc[3],
              step_count: proc.stepCount || proc[4],
              changed_steps: [],
            });
          }
          affectedProcesses.get(pid)!.changed_steps.push({
            symbol: symNameById.get(nodeId) ?? nodeId,
            step: proc.step || proc[5],
          });
        }
      } catch (e) {
        logQueryError('detect-changes:process-lookup', e);
      }
    }

    const processCount = affectedProcesses.size;
    const risk =
      processCount === 0
        ? 'low'
        : processCount <= 5
          ? 'medium'
          : processCount <= 15
            ? 'high'
            : 'critical';

    return {
      summary: {
        changed_count: changedSymbols.length,
        affected_count: processCount,
        changed_files: fileDiffs.length,
        risk_level: risk,
      },
      changed_symbols: changedSymbols,
      affected_processes: Array.from(affectedProcesses.values()),
    };
  }

  /**
   * Rename tool — multi-file coordinated rename using graph + text search.
   * Graph refs are tagged "graph" (high confidence).
   * Additional refs found via text search are tagged "text_search" (lower confidence).
   */
  private async rename(
    repo: RepoHandle,
    params: {
      symbol_name?: string;
      symbol_uid?: string;
      new_name: string;
      file_path?: string;
      dry_run?: boolean;
    },
  ): Promise<any> {
    await this.ensureInitialized(repo.id);

    const { new_name, file_path } = params;
    const dry_run = params.dry_run ?? true;

    if (!params.symbol_name && !params.symbol_uid) {
      return { error: 'Either symbol_name or symbol_uid is required.' };
    }

    /** Guard: ensure a file path resolves within the repo root (prevents path traversal) */
    const assertSafePath = (filePath: string): string => {
      const full = path.resolve(repo.repoPath, filePath);
      if (!full.startsWith(repo.repoPath + path.sep) && full !== repo.repoPath) {
        throw new Error(`Path traversal blocked: ${filePath}`);
      }
      return full;
    };

    // Step 1: Find the target symbol (reuse context's lookup)
    const lookupResult = await this.context(repo, {
      name: params.symbol_name,
      uid: params.symbol_uid,
      file_path,
    });

    if (lookupResult.status === 'ambiguous') {
      return lookupResult; // pass disambiguation through
    }
    if (lookupResult.error) {
      return lookupResult;
    }

    const sym = lookupResult.symbol;
    const oldName = sym.name;

    if (oldName === new_name) {
      return { error: 'New name is the same as the current name.' };
    }

    // Step 2: Collect edits from graph (high confidence)
    const changes = new Map<string, { file_path: string; edits: any[] }>();

    const addEdit = (
      filePath: string,
      line: number,
      oldText: string,
      newText: string,
      confidence: string,
    ) => {
      if (!changes.has(filePath)) {
        changes.set(filePath, { file_path: filePath, edits: [] });
      }
      changes.get(filePath)!.edits.push({ line, old_text: oldText, new_text: newText, confidence });
    };

    // The definition itself
    if (sym.filePath && sym.startLine) {
      try {
        const content = await fs.readFile(assertSafePath(sym.filePath), 'utf-8');
        const lines = content.split('\n');
        const lineIdx = sym.startLine - 1;
        if (lineIdx >= 0 && lineIdx < lines.length && lines[lineIdx].includes(oldName)) {
          const defRegex = new RegExp(
            `\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
            'g',
          );
          addEdit(
            sym.filePath,
            sym.startLine,
            lines[lineIdx].trim(),
            lines[lineIdx].replace(defRegex, new_name).trim(),
            'graph',
          );
        }
      } catch (e) {
        logQueryError('rename:read-definition', e);
      }
    }

    // All incoming refs from graph (callers, importers, etc.)
    const allIncoming = [
      ...(lookupResult.incoming.calls || []),
      ...(lookupResult.incoming.imports || []),
      ...(lookupResult.incoming.extends || []),
      ...(lookupResult.incoming.implements || []),
    ];

    let graphEdits = changes.size > 0 ? 1 : 0; // count definition edit

    for (const ref of allIncoming) {
      if (!ref.filePath) continue;
      try {
        const content = await fs.readFile(assertSafePath(ref.filePath), 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(oldName)) {
            addEdit(
              ref.filePath,
              i + 1,
              lines[i].trim(),
              lines[i]
                .replace(
                  new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'),
                  new_name,
                )
                .trim(),
              'graph',
            );
            graphEdits++;
            break; // one edit per file from graph refs
          }
        }
      } catch (e) {
        logQueryError('rename:read-ref', e);
      }
    }

    // Step 3: Text search for refs the graph might have missed
    let astSearchEdits = 0;
    const graphFiles = new Set(
      [sym.filePath, ...allIncoming.map((r) => r.filePath)].filter(Boolean),
    );

    // Simple text search across the repo for the old name (in files not already covered by graph)
    try {
      const { execFileSync } = await import('child_process');
      const rgArgs = [
        '-l',
        '--type-add',
        'code:*.{ts,tsx,js,jsx,py,go,rs,java,c,h,cpp,cc,cxx,hpp,hxx,hh,cs,php,swift}',
        '-t',
        'code',
        `\\b${oldName}\\b`,
        '.',
      ];
      const output = execFileSync('rg', rgArgs, {
        cwd: repo.repoPath,
        encoding: 'utf-8',
        timeout: 5000,
        // Avoid ENOBUFS on large repos: rg -l can list many files.
        maxBuffer: 256 * 1024 * 1024,
      });
      const files = output
        .trim()
        .split('\n')
        .filter((f) => f.length > 0);

      for (const file of files) {
        const normalizedFile = file.replace(/\\/g, '/').replace(/^\.\//, '');
        if (graphFiles.has(normalizedFile)) continue; // already covered by graph

        try {
          const content = await fs.readFile(assertSafePath(normalizedFile), 'utf-8');
          const lines = content.split('\n');
          const regex = new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
          for (let i = 0; i < lines.length; i++) {
            regex.lastIndex = 0;
            if (regex.test(lines[i])) {
              regex.lastIndex = 0;
              addEdit(
                normalizedFile,
                i + 1,
                lines[i].trim(),
                lines[i].replace(regex, new_name).trim(),
                'text_search',
              );
              astSearchEdits++;
            }
          }
        } catch (e) {
          logQueryError('rename:text-search-read', e);
        }
      }
    } catch (e) {
      logQueryError('rename:ripgrep', e);
    }

    // Step 4: Apply or preview
    const allChanges = Array.from(changes.values());
    const totalEdits = allChanges.reduce((sum, c) => sum + c.edits.length, 0);

    if (!dry_run) {
      // Apply edits to files
      for (const change of allChanges) {
        try {
          const fullPath = assertSafePath(change.file_path);
          let content = await fs.readFile(fullPath, 'utf-8');
          const regex = new RegExp(`\\b${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
          content = content.replace(regex, new_name);
          await fs.writeFile(fullPath, content, 'utf-8');
        } catch (e) {
          logQueryError('rename:apply-edit', e);
        }
      }
    }

    return {
      status: 'success',
      old_name: oldName,
      new_name,
      files_affected: allChanges.length,
      total_edits: totalEdits,
      graph_edits: graphEdits,
      text_search_edits: astSearchEdits,
      changes: allChanges,
      applied: !dry_run,
    };
  }

  private async impact(repo: RepoHandle, params: {
    target: string;
    target_uid?: string;
    file_path?: string;
    direction: 'upstream' | 'downstream';
    maxDepth?: number;
    relationTypes?: string[];
    includeTests?: boolean;
    minConfidence?: number;
  }): Promise<any> {
    try {
      return await this._impactImpl(repo, params);
    } catch (err: any) {
      // Return structured error instead of crashing (#321)
      return {
        error: (err instanceof Error ? err.message : String(err)) || 'Impact analysis failed',
        target: { name: params.target },
        direction: params.direction,
        impactedCount: 0,
        risk: 'UNKNOWN',
        suggestion: 'The graph query failed — try gitnexus context <symbol> as a fallback',
        ...(isWalCorruptionError(err) ? { recoverySuggestion: WAL_RECOVERY_SUGGESTION } : {}),
      };
    }
  }

  private async _impactImpl(repo: RepoHandle, params: {
    target: string;
    target_uid?: string;
    file_path?: string;
    direction: 'upstream' | 'downstream';
    maxDepth?: number;
    relationTypes?: string[];
    includeTests?: boolean;
    minConfidence?: number;
  }): Promise<any> {
    await this.ensureInitialized(repo.id);
    
    const { target, target_uid, file_path, direction } = params;
    const maxDepth = params.maxDepth || 3;
    const usesDefaultRelationTypes = !params.relationTypes || params.relationTypes.length === 0;
    const rawRelTypes = params.relationTypes && params.relationTypes.length > 0
      ? params.relationTypes.filter(t => VALID_RELATION_TYPES.has(t))
      : ['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS'];
    const relationTypes = rawRelTypes.length > 0 ? rawRelTypes : ['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS'];
    const includeTests = params.includeTests ?? false;
    const minConfidence = params.minConfidence ?? 0;
    const shouldBridgeClassMethods = usesDefaultRelationTypes;

    // Resolve target via the shared symbol resolver. When the caller passes
    // target_uid we skip the name lookup entirely (zero-ambiguity). Otherwise
    // we rank candidates (#470) and either proceed with a confident single
    // match, or return a structured ambiguous response instead of silently
    // picking the wrong symbol.
    //
    // The resolver preserves the #480 Class/Constructor preference heuristic:
    // when a Class and its Constructor share name + filePath, the Class is
    // selected silently.
    const outcome = await this.resolveSymbolCandidates(
      repo,
      { uid: params.target_uid, name: target },
      { file_path: params.file_path, kind: params.kind },
    );

    if (outcome.kind === 'not_found') {
      const missing = params.target_uid ?? target;
      return {
        error: `Target '${missing}' not found`,
        target: { name: target },
        direction,
        impactedCount: 0,
        risk: 'UNKNOWN',
      };
    }

    if (outcome.kind === 'ambiguous') {
      return {
        status: 'ambiguous',
        message: `Found ${outcome.candidates.length} symbols matching '${target}'. Use target_uid, file_path, or kind to disambiguate.`,
        target: { name: target },
        direction,
        impactedCount: 0,
        risk: 'UNKNOWN',
        candidates: outcome.candidates.map((c) => ({
          uid: c.id,
          name: c.name,
          kind: c.type,
          filePath: c.filePath,
          line: c.startLine,
          score: Number(c.score.toFixed(2)),
        })),
      };
    }

    const sym = {
      id: outcome.symbol.id,
      name: outcome.symbol.name,
      filePath: outcome.symbol.filePath,
    };
    const symType = outcome.resolvedLabel || outcome.symbol.type || '';

    return this._runImpactBFS(repo, sym, symType, direction, {
      maxDepth,
      relationTypes,
      includeTests,
      minConfidence,
    });
  }

  /**
   * Shared BFS traversal for impact analysis (name-resolved or UID-resolved symbol).
   */
  private async _runImpactBFS(
    repo: RepoHandle,
    sym: any,
    symType: string,
    direction: 'upstream' | 'downstream',
    opts: {
      maxDepth: number;
      relationTypes: string[];
      includeTests: boolean;
      minConfidence: number;
    },
  ): Promise<any> {
    const { maxDepth, relationTypes, includeTests, minConfidence } = opts;
    const relTypeFilter = relationTypes.map((t) => `'${t}'`).join(', ');
    const confidenceFilter = minConfidence > 0 ? ` AND r.confidence >= ${minConfidence}` : '';

    const targetQueryParts: string[] = [];
    const targetParams: Record<string, any> = { targetName: target };
    if (target_uid) {
      targetQueryParts.push('n.id = $targetUid');
      targetParams.targetUid = target_uid;
    } else if (file_path) {
      targetQueryParts.push('n.name = $targetName');
      targetQueryParts.push('n.filePath CONTAINS $filePath');
      targetParams.filePath = file_path;
    } else if (target.includes('/') || target.includes(':')) {
      targetQueryParts.push('(n.id = $targetName OR n.name = $targetName)');
    } else {
      targetQueryParts.push('n.name = $targetName');
    }

    const targets = await executeParameterized(repo.id, `
      MATCH (n)
      WHERE ${targetQueryParts.join(' AND ')}
      RETURN n.id AS id, n.name AS name, labels(n)[0] AS type, n.filePath AS filePath
      LIMIT 10
    `, targetParams);
    if (targets.length === 0) return { error: `Target '${target}' not found` };
    
    const sym = targets[0];
    const symId = sym.id || sym[0];

    const impacted: any[] = [];
    const visited = new Set<string>([symId]);
    let frontier = [symId];
    let frontierKindById = new Map<string, string>([[symId, sym.type || sym[2] || '']]);
    let traversalComplete = true;

    // Fix #480: For Java (and other JVM) Class/Interface nodes, CALLS edges
    // point to Constructor nodes and IMPORTS edges point to File nodes — not
    // the Class/Interface itself. Seed the frontier with the Constructor(s)
    // and owning File so the BFS traversal finds those edges naturally.
    // The owning File is kept only as an internal seed (frontier/visited) and
    // is NOT added to impacted — it is the definition container, not an
    // upstream dependent. The BFS will discover IMPORTS edges on it naturally.
    if (symType === 'Class' || symType === 'Interface') {
      try {
        // Run both seed queries in parallel — they are independent.
        const [ctorRows, fileRows] = await Promise.all([
          executeParameterized(
            repo.id,
            `
            MATCH (n)-[hm:CodeRelation]->(c:Constructor)
            WHERE n.id = $symId AND hm.type = 'HAS_METHOD'
            RETURN c.id AS id, c.name AS name, labels(c)[0] AS type, c.filePath AS filePath
          `,
            { symId },
          ),
          // Restrict to DEFINES edges only — other File->Class edge types (if
          // any) should not be treated as the owning file relationship.
          executeParameterized(
            repo.id,
            `
            MATCH (f:File)-[rel:CodeRelation]->(n)
            WHERE n.id = $symId AND rel.type = 'DEFINES'
            RETURN f.id AS id, f.name AS name, labels(f)[0] AS type, f.filePath AS filePath
          `,
            { symId },
          ),
        ]);

        for (const r of ctorRows) {
          const rid = r.id || r[0];
          if (rid && !visited.has(rid)) {
            visited.add(rid);
            frontier.push(rid);
          }
        }
        for (const r of fileRows) {
          const rid = r.id || r[0];
          if (rid && !visited.has(rid)) {
            visited.add(rid);
            frontier.push(rid);
          }
        }
      } catch (e) {
        logQueryError('impact:class-node-expansion', e);
      }
    }

    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
      const nextFrontier: string[] = [];
      
      let traversalFrontier = [...frontier];

      // Bridge class-like symbols through HAS_METHOD so class-level impact includes method-level dependencies.
      if (shouldBridgeClassMethods) {
        if (frontier.length > 0) {
          try {
            const bridgeRows = await executeParameterized(repo.id, `
              MATCH (container)-[r:CodeRelation {type: 'HAS_METHOD'}]->(method)
              WHERE container.id IN $frontierIds${confidenceFilter}
              RETURN container.id AS containerId, method.id AS methodId, method.name AS methodName, labels(method)[0] AS methodType, method.filePath AS methodFilePath
            `, { frontierIds: frontier });

            for (const bridge of bridgeRows) {
              const methodId = bridge.methodId || bridge[1];
              const methodType = bridge.methodType || bridge[3];
              if (!methodId) continue;
              if (!frontierKindById.has(methodId)) {
                frontierKindById.set(methodId, methodType || '');
              }

              if (direction === 'upstream') {
                traversalFrontier.push(methodId);
              } else {
                const methodFilePath = bridge.methodFilePath || bridge[4] || '';
                if (!includeTests && isTestFilePath(methodFilePath)) continue;
                if (!visited.has(methodId)) {
                  visited.add(methodId);
                  nextFrontier.push(methodId);
                  impacted.push({
                    depth,
                    id: methodId,
                    name: bridge.methodName || bridge[2],
                    type: methodType,
                    filePath: methodFilePath,
                    relationType: 'HAS_METHOD',
                    confidence: 1.0,
                  });
                }
              }
            }
          } catch (e) {
            logQueryError('impact:class-method-bridge', e);
            traversalComplete = false;
            break;
          }
        }
      }

      // de-dupe traversal frontier (class + bridged methods)
      traversalFrontier = [...new Set(traversalFrontier)];

      // Batch frontier nodes into a single Cypher query per depth level
      const query = direction === 'upstream'
        ? `MATCH (caller)-[r:CodeRelation]->(n) WHERE n.id IN $frontierIds AND r.type IN [${relTypeFilter}]${confidenceFilter} RETURN n.id AS sourceId, caller.id AS id, caller.name AS name, labels(caller)[0] AS type, caller.filePath AS filePath, r.type AS relType, r.confidence AS confidence`
        : `MATCH (n)-[r:CodeRelation]->(callee) WHERE n.id IN $frontierIds AND r.type IN [${relTypeFilter}]${confidenceFilter} RETURN n.id AS sourceId, callee.id AS id, callee.name AS name, labels(callee)[0] AS type, callee.filePath AS filePath, r.type AS relType, r.confidence AS confidence`;
      
      try {
        const related = await executeParameterized(repo.id, query, { frontierIds: traversalFrontier });
        
        for (const rel of related) {
          const relId = rel.id || rel[1];
          const filePath = rel.filePath || rel[4] || '';

          if (!includeTests && isTestFilePath(filePath)) continue;

          if (!visited.has(relId)) {
            visited.add(relId);
            nextFrontier.push(relId);
            const relType = rel.type || rel[3];
            if (!frontierKindById.has(relId)) {
              frontierKindById.set(relId, relType || '');
            }
            impacted.push({
              depth,
              id: relId,
              name: rel.name || rel[2],
              type: relType,
              filePath,
              relationType,
              confidence: effectiveConfidence,
            });
          }
        }
      } catch (e) {
        logQueryError('impact:depth-traversal', e);
        // Break out of depth loop on query failure but return partial results
        // collected so far, rather than silently swallowing the error (#321)
        traversalComplete = false;
        break;
      }

      frontier = nextFrontier;
    }

    const grouped: Record<number, any[]> = {};
    for (const item of impacted) {
      if (!grouped[item.depth]) grouped[item.depth] = [];
      grouped[item.depth].push(item);
    }

    // ── Enrichment: affected processes, modules, risk ──────────────
    const directCount = (grouped[1] || []).length;
    let affectedProcesses: any[] = [];
    let affectedModules: any[] = [];

    if (impacted.length > 0) {
      const CHUNK_SIZE = 100;
      // Max number of chunks to process to avoid unbounded DB round-trips.
      // Configurable via env IMPACT_MAX_CHUNKS, default 10 => max items = 1000
      const MAX_CHUNKS = parseInt(process.env.IMPACT_MAX_CHUNKS || '10', 10);

      // ── Process enrichment: batched chunking (bounded by MAX_CHUNKS) ─
      // Uses merged Cypher query (WITH + OPTIONAL MATCH) to fetch
      // process + entry point info in 1 round-trip per chunk. Converted to
      // parameterized queries to avoid manual string escaping and long query strings.
      const entryPointMap = new Map<
        string,
        {
          name: string;
          type: string;
          filePath: string;
          affected_process_count: number;
          total_hits: number;
          earliest_broken_step: number;
        }
      >();

      // Map process id -> entryPointId to allow fixing missing minStep values later
      const processToEntryPoint = new Map<string, string>();
      // Collect process ids where MIN(r.step) returned null so we can retry in batch
      const processesMissingMinStep = new Set<string>();

      let chunksProcessed = 0;
      for (
        let i = 0;
        i < impacted.length && chunksProcessed < MAX_CHUNKS;
        i += CHUNK_SIZE, chunksProcessed++
      ) {
        const chunk = impacted.slice(i, i + CHUNK_SIZE);
        const ids = chunk.map((item) => String(item.id ?? ''));

        try {
          // Use parameterized list to avoid building long query strings
          const rows = await executeParameterized(
            repo.id,
            `
            MATCH (s)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process)
            WHERE s.id IN $ids
            WITH p, COUNT(DISTINCT s.id) AS hits, MIN(r.step) AS minStep
            OPTIONAL MATCH (ep {id: p.entryPointId})
            RETURN p.id AS pId, p.heuristicLabel AS name, p.processType AS processType,
                   p.entryPointId AS entryPointId, hits, minStep, p.stepCount AS stepCount,
                   ep.name AS epName, labels(ep)[0] AS epType, ep.filePath AS epFilePath
          `,
            { ids },
          ).catch(() => []);

          for (const row of rows) {
            const pId = row.pId ?? row[0];
            const epId = row.entryPointId ?? row[3] ?? row.pId ?? row[0];
            // Track mapping from process -> entryPoint so we can backfill missing minStep
            if (pId) processToEntryPoint.set(String(pId), String(epId));

            // Normalize epName: prefer epName, fall back to other columns, and
            // ensure we don't keep an empty string (labels(...) can return "").
            const epNameRaw = row.epName ?? row[7] ?? row.name ?? row[1] ?? 'unknown';
            const epName =
              typeof epNameRaw === 'string' && epNameRaw.trim().length > 0
                ? epNameRaw.trim()
                : 'unknown';

            // Normalize epType: labels(ep)[0] can return an empty string in
            // some DBs (LadybugDB). Using nullish coalescing (??) preserves
            // empty strings, which results in empty `type` values being
            // propagated. Treat empty-string labels as missing and fall back
            // to the next candidate or a sensible default.
            const epTypeRaw = row.epType ?? row[8] ?? '';
            const epType =
              typeof epTypeRaw === 'string' && epTypeRaw.trim().length > 0
                ? epTypeRaw.trim()
                : 'Function';

            const epFilePath = row.epFilePath ?? row[9] ?? '';
            const hits = row.hits ?? row[4] ?? 0;
            const minStep = row.minStep ?? row[5];
            // If the DB returned null for minStep, note the process id so we
            // can run a follow-up query using a different aggregation strategy.
            if (minStep === null || minStep === undefined) {
              if (pId) processesMissingMinStep.add(String(pId));
            }
            if (!entryPointMap.has(epId)) {
              entryPointMap.set(epId, {
                name: epName,
                type: epType,
                filePath: epFilePath,
                affected_process_count: 0,
                total_hits: 0,
                earliest_broken_step: Infinity,
              });
            }
            const ep = entryPointMap.get(epId)!;
            ep.affected_process_count += 1;
            ep.total_hits += hits;
            ep.earliest_broken_step = Math.min(ep.earliest_broken_step, minStep ?? Infinity);
          }
        } catch (e) {
          logQueryError('impact:process-chunk', e);
        }
      }

      // If some processes returned null minStep, try a batched follow-up query
      // using the full impacted id set. This handles older indexes or DBs
      // where MIN(r.step) can come back null even when step properties exist.
      if (processesMissingMinStep.size > 0) {
        try {
          const pIds = Array.from(processesMissingMinStep);
          const allImpactedIds = impacted.map((it) => String(it.id ?? ''));
          const missingRows = await executeParameterized(
            repo.id,
            `
            MATCH (s)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process)
            WHERE p.id IN $pIds AND s.id IN $ids
            RETURN p.id AS pid, MIN(r.step) AS minStep
          `,
            { pIds, ids: allImpactedIds },
          ).catch(() => []);

          for (const mr of missingRows) {
            const pid = mr.pid ?? mr[0];
            const minStep = mr.minStep ?? mr[1];
            const epId = processToEntryPoint.get(String(pid));
            if (!epId) continue;
            const ep = entryPointMap.get(epId);
            if (!ep) continue;
            if (typeof minStep === 'number') {
              ep.earliest_broken_step = Math.min(ep.earliest_broken_step, minStep);
            }
          }
        } catch (e) {
          logQueryError('impact:process-chunk-backfill', e);
        }
      }

      // If we capped chunks, mark traversal incomplete so caller knows results are partial
      if (chunksProcessed * CHUNK_SIZE < impacted.length) {
        traversalComplete = false;
      }

      affectedProcesses = Array.from(entryPointMap.values())
        .map((ep) => ({
          ...ep,
          earliest_broken_step:
            ep.earliest_broken_step === Infinity ? null : ep.earliest_broken_step,
        }))
        .sort((a, b) => b.total_hits - a.total_hits);

      // ── Module enrichment: use same cap as process enrichment and parameterized queries
      const maxItems = Math.min(impacted.length, MAX_CHUNKS * CHUNK_SIZE);
      const cappedImpacted = impacted.slice(0, maxItems);
      const allIdsArr = cappedImpacted.map((i: any) => String(i.id ?? ''));
      const d1Items = (grouped[1] || []).slice(0, maxItems);
      const d1IdsArr = d1Items.map((i: any) => String(i.id ?? ''));

      // Chunked module enrichment: run the MEMBER_OF queries in chunks
      // to avoid large single queries or concurrent Kuzu calls that can
      // crash (SIGSEGV) on arm64 macOS; behavior preserves existing maxItems cap and returns equivalent aggregated results.
      const moduleHitsMap = new Map<string, number>();
      const directModuleSet = new Set<string>();

      // Helper to run a single module chunk and accumulate hits by name
      const runModuleChunk = async (idsChunk: string[]) => {
        if (!idsChunk || idsChunk.length === 0) return;
        try {
          const rows = await executeParameterized(
            repo.id,
            `
            MATCH (s)-[:CodeRelation {type: 'MEMBER_OF'}]->(c:Community)
            WHERE s.id IN $ids
            RETURN c.heuristicLabel AS name, COUNT(DISTINCT s.id) AS hits
            ORDER BY hits DESC
            LIMIT 20
          `,
            { ids: idsChunk },
          ).catch(() => []);

          for (const r of rows) {
            const name = r.name ?? r[0] ?? null;
            const hits = (r.hits ?? r[1]) || 0;
            if (!name) continue;
            moduleHitsMap.set(name, (moduleHitsMap.get(name) || 0) + hits);
          }
        } catch (e) {
          logQueryError('impact:module-chunk', e);
        }
      };

      // Run module query chunks sequentially (safe on arm64 macOS)
      for (let i = 0; i < allIdsArr.length; i += CHUNK_SIZE) {
        const chunkIds = allIdsArr.slice(i, i + CHUNK_SIZE);
        await runModuleChunk(chunkIds);
      }

      // Run direct module query similarly (distinct heuristic labels for depth-1 items)
      const runDirectModuleChunk = async (idsChunk: string[]) => {
        if (!idsChunk || idsChunk.length === 0) return;
        try {
          const rows = await executeParameterized(
            repo.id,
            `
            MATCH (s)-[:CodeRelation {type: 'MEMBER_OF'}]->(c:Community)
            WHERE s.id IN $ids
            RETURN DISTINCT c.heuristicLabel AS name
          `,
            { ids: idsChunk },
          ).catch(() => []);
          for (const r of rows) {
            const name = r.name ?? r[0] ?? null;
            if (name) directModuleSet.add(name);
          }
        } catch (e) {
          logQueryError('impact:direct-module-chunk', e);
        }
      };

      for (let i = 0; i < d1IdsArr.length; i += CHUNK_SIZE) {
        const chunkIds = d1IdsArr.slice(i, i + CHUNK_SIZE);
        await runDirectModuleChunk(chunkIds);
      }

      // Build final moduleRows array from aggregated hits map, sorted & limited
      const moduleRows = Array.from(moduleHitsMap.entries())
        .map(([name, hits]) => ({ name, hits }))
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 20);

      const directModuleRows = Array.from(directModuleSet).map((name) => ({ name }));

      // Build affectedModules in the same shape as original implementation
      const directModuleNameSet = new Set(directModuleRows.map((r: any) => r.name || r[0]));
      affectedModules = moduleRows.map((r: any) => {
        const name = r.name ?? r[0];
        const hits = r.hits ?? r[1] ?? 0;
        return {
          name,
          hits,
          impact: directModuleNameSet.has(name) ? 'direct' : 'indirect',
        };
      });
    }

    // Risk scoring
    const processCount = affectedProcesses.length;
    const moduleCount = affectedModules.length;
    let risk = 'LOW';
    if (directCount >= 30 || processCount >= 5 || moduleCount >= 5 || impacted.length >= 200) {
      risk = 'CRITICAL';
    } else if (
      directCount >= 15 ||
      processCount >= 3 ||
      moduleCount >= 3 ||
      impacted.length >= 100
    ) {
      risk = 'HIGH';
    } else if (directCount >= 5 || impacted.length >= 30) {
      risk = 'MEDIUM';
    }

    return {
      target: {
        id: symId,
        name: sym.name || sym[1],
        type: symType,
        filePath: sym.filePath || sym[2],
      },
      direction,
      impactedCount: impacted.length,
      risk,
      ...(!traversalComplete && { partial: true }),
      summary: {
        direct: directCount,
        processes_affected: processCount,
        modules_affected: moduleCount,
      },
      affected_processes: affectedProcesses,
      affected_modules: affectedModules,
      byDepth: grouped,
    };
  }

  /**
   * UID-based impact for cross-repo fan-out. Same result shape as `impact`.
   * Returns null if the repo is unknown, the UID is missing, or analysis fails.
   */
  async impactByUid(
    repoId: string,
    uid: string,
    direction: string,
    opts: {
      maxDepth: number;
      relationTypes: string[];
      minConfidence: number;
      includeTests: boolean;
      signal?: AbortSignal;
    },
  ): Promise<any | null> {
    // Honor an already-aborted signal at the entry boundary as a fast
    // path. Cooperative cancellation inside _runImpactBFS is out of
    // scope — the caller's Promise.race against the same signal
    // resolves the await regardless of how long this body runs.
    if (opts.signal?.aborted) return null;
    try {
      await this.refreshRepos();
      await this.ensureInitialized(repoId);
    } catch {
      return null;
    }

    const repo = this.repos.get(repoId);
    if (!repo) return null;

    const dir: 'upstream' | 'downstream' = direction === 'downstream' ? 'downstream' : 'upstream';

    let rows: any[];
    try {
      rows = await executeParameterized(
        repoId,
        `MATCH (n) WHERE n.id = $uid
         RETURN n.id AS id, n.name AS name, n.filePath AS filePath, labels(n)[0] AS type
         LIMIT 1`,
        { uid },
      );
    } catch {
      return null;
    }
    if (!rows?.length) return null;

    const sym = rows[0];
    const labelRaw = sym.type ?? sym[3];
    const symType =
      typeof labelRaw === 'string' && labelRaw.trim().length > 0 ? labelRaw.trim() : '';

    // Map legacy relation type names (backward compat for OVERRIDES → METHOD_OVERRIDES)
    const mappedRelTypes = opts.relationTypes?.flatMap((t: string) =>
      t === 'OVERRIDES' ? ['OVERRIDES', 'METHOD_OVERRIDES'] : [t],
    );
    const rawRelTypes =
      mappedRelTypes && mappedRelTypes.length > 0
        ? mappedRelTypes.filter((t: string) => VALID_RELATION_TYPES.has(t))
        : [
            'CALLS',
            'IMPORTS',
            'EXTENDS',
            'IMPLEMENTS',
            'METHOD_OVERRIDES',
            'OVERRIDES',
            'METHOD_IMPLEMENTS',
          ];
    const relationTypes =
      rawRelTypes.length > 0
        ? rawRelTypes
        : [
            'CALLS',
            'IMPORTS',
            'EXTENDS',
            'IMPLEMENTS',
            'METHOD_OVERRIDES',
            'OVERRIDES',
            'METHOD_IMPLEMENTS',
          ];

    try {
      return await this._runImpactBFS(repo, sym, symType, dir, {
        maxDepth: opts.maxDepth,
        relationTypes,
        includeTests: opts.includeTests,
        minConfidence: opts.minConfidence,
      });
    } catch {
      return null;
    }
  }

  private handleGroupTool(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'group_list':
        return this.groupList(params);
      case 'group_sync':
        return this.groupSync(params);
      default:
        throw new Error(
          `Unknown group tool: ${method}. Removed tools: use repo "@<groupName>" on impact, query, or context (optional "/<memberPath>"), or MCP resources.`,
        );
    }
  }

  /**
   * Dispatch impact/query/context when `repo` is `@groupName` or `@groupName/memberPath`
   * (group mode — not the global indexed-repo `repo` parameter).
   */
  private async callToolAtGroupRepo(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    await this.refreshRepos();

    if (
      params.service !== undefined &&
      params.service !== null &&
      String(params.service).trim() === ''
    ) {
      return { error: 'service must not be an empty string' };
    }

    const raw = String(params.repo).slice(1);
    const slash = raw.indexOf('/');
    const groupName = (slash === -1 ? raw : raw.slice(0, slash)).trim();
    const memberRest = slash === -1 ? undefined : raw.slice(slash + 1).trim() || undefined;

    const resolved = await resolveAtGroupMemberRepoPath(groupName, memberRest);
    if (resolved.ok === false) return { error: resolved.error };

    const svc = this.getGroupService();
    if (method === 'impact') {
      const impactArgs: Record<string, unknown> = {
        name: groupName,
        repo: resolved.repoPath,
        target: params.target,
        direction: params.direction,
      };
      if (params.maxDepth !== undefined) impactArgs.maxDepth = params.maxDepth;
      if (params.crossDepth !== undefined) impactArgs.crossDepth = params.crossDepth;
      if (params.relationTypes !== undefined) impactArgs.relationTypes = params.relationTypes;
      if (params.includeTests !== undefined) impactArgs.includeTests = params.includeTests;
      if (params.minConfidence !== undefined) impactArgs.minConfidence = params.minConfidence;
      if (params.service !== undefined && params.service !== null)
        impactArgs.service = params.service;
      if (typeof params.subgroup === 'string') impactArgs.subgroup = params.subgroup;
      if (params.timeoutMs !== undefined) impactArgs.timeoutMs = params.timeoutMs;
      if (params.timeout !== undefined) impactArgs.timeout = params.timeout;
      return svc.groupImpact(impactArgs);
    }
    if (method === 'query') {
      const queryArgs: Record<string, unknown> = {
        name: groupName,
        query: params.query,
      };
      if (typeof params.task_context === 'string') queryArgs.task_context = params.task_context;
      if (typeof params.goal === 'string') queryArgs.goal = params.goal;
      if (typeof params.limit === 'number') queryArgs.limit = params.limit;
      if (typeof params.max_symbols === 'number') queryArgs.max_symbols = params.max_symbols;
      if (params.include_content !== undefined) queryArgs.include_content = params.include_content;
      if (params.service !== undefined && params.service !== null)
        queryArgs.service = params.service;
      if (memberRest !== undefined) {
        queryArgs.subgroup = memberRest;
        queryArgs.subgroupExact = true;
      }
      return svc.groupQuery(queryArgs);
    }
    if (method === 'context') {
      const targetSym =
        typeof params.target === 'string' && params.target.trim() !== ''
          ? params.target.trim()
          : typeof params.name === 'string' && params.name.trim() !== ''
            ? params.name.trim()
            : undefined;
      const contextArgs: Record<string, unknown> = {
        name: groupName,
        target: targetSym,
      };
      if (typeof params.uid === 'string') contextArgs.uid = params.uid;
      if (typeof params.file_path === 'string') contextArgs.file_path = params.file_path;
      if (params.include_content !== undefined)
        contextArgs.include_content = params.include_content;
      if (params.service !== undefined && params.service !== null)
        contextArgs.service = params.service;
      if (memberRest !== undefined) {
        contextArgs.subgroup = memberRest;
        contextArgs.subgroupExact = true;
      }
      return svc.groupContext(contextArgs);
    }
    throw new Error(`Internal: unsupported group-repo tool ${method}`);
  }

  private async groupList(params: Record<string, unknown>): Promise<unknown> {
    return this.getGroupService().groupList(params);
  }

  private async groupSync(params: Record<string, unknown>): Promise<unknown> {
    return this.getGroupService().groupSync(params);
  }

  /**
   * MCP resource body for `gitnexus://group/{name}/contracts` (Issue #794).
   */
  async readGroupContractsResource(
    groupName: string,
    filter: { type?: string; repo?: string; unmatchedOnly?: boolean },
  ): Promise<string> {
    try {
      const params: Record<string, unknown> = { name: groupName };
      if (filter.type !== undefined) params.type = filter.type;
      if (filter.repo !== undefined) params.repo = filter.repo;
      if (filter.unmatchedOnly === true) params.unmatchedOnly = true;
      const raw = await this.getGroupService().groupContracts(params);
      return LocalBackend.formatGroupResourcePayload(raw);
    } catch (e) {
      return `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  /**
   * MCP resource body for `gitnexus://group/{name}/status` (Issue #794).
   */
  async readGroupStatusResource(groupName: string): Promise<string> {
    try {
      const raw = await this.getGroupService().groupStatus({ name: groupName });
      return LocalBackend.formatGroupResourcePayload(raw);
    } catch (e) {
      return `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  private static formatGroupResourcePayload(raw: unknown): string {
    if (raw && typeof raw === 'object' && 'error' in raw) {
      const err = (raw as { error?: unknown }).error;
      if (typeof err === 'string' && err.length > 0) {
        return `error: ${err}`;
      }
    }
    return JSON.stringify(raw, null, 2);
  }

  /**
   * Fetch Route nodes with their consumers in a single query.
   * Shared by routeMap and shapeCheck to avoid N+1 query patterns.
   */
  private async fetchRoutesWithConsumers(
    repoId: string,
    routeFilter: string,
    params: Record<string, string>,
  ): Promise<
    Array<{
      id: string;
      name: string;
      filePath: string;
      responseKeys: string[] | null;
      errorKeys: string[] | null;
      middleware: string[] | null;
      consumers: Array<{
        name: string;
        filePath: string;
        accessedKeys?: string[];
        fetchCount?: number;
      }>;
    }>
  > {
    const rows = await executeParameterized(
      repoId,
      `
      MATCH (n:Route)
      WHERE n.id STARTS WITH 'Route:' ${routeFilter}
      OPTIONAL MATCH (consumer)-[r:CodeRelation]->(n)
      WHERE r.type = 'FETCHES'
      RETURN n.id AS routeId, n.name AS routeName, n.filePath AS handlerFile,
             n.responseKeys AS responseKeys, n.errorKeys AS errorKeys, n.middleware AS middleware,
             consumer.name AS consumerName, consumer.filePath AS consumerFile,
             r.reason AS fetchReason
    `,
      params,
    );

    // Strip wrapping quotes from DB array elements — CSV COPY stores ['key'] which
    // LadybugDB may return as "'key'" rather than "key"
    const stripQuotes = (keys: string[] | null): string[] | null =>
      keys ? keys.map((k) => k.replace(/^['"]|['"]$/g, '')) : null;

    const routeMap = new Map<
      string,
      {
        id: string;
        name: string;
        filePath: string;
        responseKeys: string[] | null;
        errorKeys: string[] | null;
        middleware: string[] | null;
        consumers: Array<{
          name: string;
          filePath: string;
          accessedKeys?: string[];
          fetchCount?: number;
        }>;
      }
    >();
    for (const row of rows) {
      const id = row.routeId ?? row[0];
      const name = row.routeName ?? row[1];
      const filePath = row.handlerFile ?? row[2];
      const responseKeys = stripQuotes(row.responseKeys ?? row[3] ?? null);
      const errorKeys = stripQuotes(row.errorKeys ?? row[4] ?? null);
      const middleware = stripQuotes(row.middleware ?? row[5] ?? null);
      const consumerName = row.consumerName ?? row[6];
      const consumerFile = row.consumerFile ?? row[7];
      const fetchReason: string | null = row.fetchReason ?? row[8] ?? null;

      if (!routeMap.has(id)) {
        routeMap.set(id, {
          id,
          name,
          filePath,
          responseKeys,
          errorKeys,
          middleware,
          consumers: [],
        });
      }
      if (consumerName && consumerFile) {
        // Parse accessed keys from reason field: "fetch-url-match|keys:data,pagination|fetches:3"
        let accessedKeys: string[] | undefined;
        let fetchCount: number | undefined;
        if (fetchReason) {
          const keysMatch = fetchReason.match(/\|keys:([^|]+)/);
          if (keysMatch) {
            accessedKeys = keysMatch[1].split(',').filter((k) => k.length > 0);
          }
          const fetchesMatch = fetchReason.match(/\|fetches:(\d+)/);
          if (fetchesMatch) {
            fetchCount = parseInt(fetchesMatch[1], 10);
          }
        }
        routeMap.get(id)!.consumers.push({
          name: consumerName,
          filePath: consumerFile,
          ...(accessedKeys ? { accessedKeys } : {}),
          ...(fetchCount && fetchCount > 1 ? { fetchCount } : {}),
        });
      }
    }

    return [...routeMap.values()];
  }

  /**
   * Batch-fetch execution flows linked to a set of Route or Tool nodes.
   * Single query instead of N+1.
   */
  private async fetchLinkedFlowsBatch(
    repoId: string,
    nodeIds: string[],
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (nodeIds.length === 0) return result;
    try {
      // Use list_contains to filter at DB level instead of fetching all and filtering in memory
      const rows = await executeParameterized(
        repoId,
        `
        MATCH (source)-[r:CodeRelation]->(proc:Process)
        WHERE r.type = 'ENTRY_POINT_OF'
          AND list_contains($nodeIds, source.id)
        RETURN source.id AS sourceId, proc.label AS name
      `,
        { nodeIds },
      );
      for (const row of rows) {
        const sourceId = row.sourceId ?? row[0];
        const name = row.name ?? row[1];
        if (!name) continue;
        let list = result.get(sourceId);
        if (!list) {
          list = [];
          result.set(sourceId, list);
        }
        list.push(name);
      }
    } catch {
      /* no ENTRY_POINT_OF edges yet */
    }
    return result;
  }

  private async routeMap(repo: RepoHandle, params: { route?: string }): Promise<any> {
    await this.ensureInitialized(repo.id);

    const routeFilter = params.route ? `AND n.name CONTAINS $route` : '';
    const queryParams = params.route ? { route: params.route } : {};
    const routes = await this.fetchRoutesWithConsumers(repo.id, routeFilter, queryParams);

    if (routes.length === 0) {
      return {
        routes: [],
        total: 0,
        message: params.route
          ? `No routes matching "${params.route}"`
          : 'No routes found in this project.',
      };
    }

    const flowMap = await this.fetchLinkedFlowsBatch(
      repo.id,
      routes.map((r) => r.id),
    );

    return {
      routes: routes.map((r) => ({
        route: r.name,
        handler: r.filePath,
        middleware: r.middleware || [],
        consumers: r.consumers,
        flows: flowMap.get(r.id) || [],
      })),
      total: routes.length,
    };
  }

  private async shapeCheck(repo: RepoHandle, params: { route?: string }): Promise<any> {
    await this.ensureInitialized(repo.id);

    const routeFilter = params.route ? `AND n.name CONTAINS $route` : '';
    const queryParams = params.route ? { route: params.route } : {};
    const allRoutes = await this.fetchRoutesWithConsumers(repo.id, routeFilter, queryParams);

    const results = allRoutes
      .filter(
        (r) =>
          ((r.responseKeys && r.responseKeys.length > 0) ||
            (r.errorKeys && r.errorKeys.length > 0)) &&
          r.consumers.length > 0,
      )
      .map((r) => {
        // Keys already normalized by fetchRoutesWithConsumers (quotes stripped)
        const responseKeys = r.responseKeys ?? [];
        const errorKeys = r.errorKeys ?? [];
        // Combined set: consumer accessing either success or error keys is valid
        const allKnownKeys = new Set([...responseKeys, ...errorKeys]);

        // Check each consumer's accessed keys against the route's response shape
        const responseKeySet = new Set(responseKeys);
        const consumers = r.consumers.map((c) => {
          if (!c.accessedKeys || c.accessedKeys.length === 0) {
            return { name: c.name, filePath: c.filePath };
          }
          const mismatched = c.accessedKeys.filter((k) => !allKnownKeys.has(k));
          // Keys in allKnownKeys but not in responseKeys — error-path access (e.g., .error from errorKeys)
          const errorPathKeys = c.accessedKeys.filter(
            (k) => allKnownKeys.has(k) && !responseKeySet.has(k),
          );
          const isMultiFetch = (c.fetchCount ?? 1) > 1;
          return {
            name: c.name,
            filePath: c.filePath,
            accessedKeys: c.accessedKeys,
            ...(mismatched.length > 0
              ? {
                  mismatched,
                  mismatchConfidence: isMultiFetch ? ('low' as const) : ('high' as const),
                }
              : {}),
            ...(errorPathKeys.length > 0 ? { errorPathKeys } : {}),
            ...(isMultiFetch
              ? {
                  attributionNote: `This file fetches ${c.fetchCount} routes — accessed keys may belong to a different route.`,
                }
              : {}),
          };
        });

        const hasMismatches = consumers.some(
          (c) => 'mismatched' in c && (c as any).mismatched.length > 0,
        );

        return {
          route: r.name,
          handler: r.filePath,
          ...(responseKeys.length > 0 ? { responseKeys } : {}),
          ...(errorKeys.length > 0 ? { errorKeys } : {}),
          consumers,
          ...(hasMismatches ? { status: 'MISMATCH' as const } : {}),
        };
      });

    const mismatchCount = results.filter((r) => r.status === 'MISMATCH').length;

    return {
      routes: results,
      total: results.length,
      routesWithShapes: results.length,
      ...(mismatchCount > 0 ? { mismatches: mismatchCount } : {}),
      message:
        results.length === 0
          ? 'No routes with both response shapes and consumers found.'
          : mismatchCount > 0
            ? `Found ${results.length} route(s) with response shape data. ${mismatchCount} route(s) have consumer/shape mismatches.`
            : `Found ${results.length} route(s) with response shape data and consumers.`,
    };
  }

  private async toolMap(repo: RepoHandle, params: { tool?: string }): Promise<any> {
    await this.ensureInitialized(repo.id);

    const toolFilter = params.tool ? `AND n.name CONTAINS $tool` : '';
    const queryParams = params.tool ? { tool: params.tool } : {};

    const rows = await executeParameterized(
      repo.id,
      `
      MATCH (n:Tool)
      WHERE n.id STARTS WITH 'Tool:' ${toolFilter}
      RETURN n.id AS id, n.name AS name, n.filePath AS filePath, n.description AS description
    `,
      queryParams,
    );

    if (rows.length === 0) {
      return {
        tools: [],
        total: 0,
        message: params.tool ? `No tools matching "${params.tool}"` : 'No tool definitions found.',
      };
    }

    const toolIds = rows.map((r: any) => r.id ?? r[0]);
    const flowMap = await this.fetchLinkedFlowsBatch(repo.id, toolIds);

    return {
      tools: rows.map((r: any) => {
        const id = r.id ?? r[0];
        return {
          name: r.name ?? r[1],
          filePath: r.filePath ?? r[2],
          description: (r.description ?? r[3] ?? '').slice(0, 200),
          flows: flowMap.get(id) || [],
        };
      }),
      total: rows.length,
    };
  }

  private async apiImpact(
    repo: RepoHandle,
    params: { route?: string; file?: string },
  ): Promise<any> {
    await this.ensureInitialized(repo.id);

    if (!params.route && !params.file) {
      return { error: 'Either "route" or "file" parameter is required.' };
    }

    // If file is provided but route is not, look up the route by file path
    let routeFilter = '';
    const queryParams: Record<string, string> = {};

    if (params.route) {
      routeFilter = `AND n.name CONTAINS $route`;
      queryParams.route = params.route;
    } else if (params.file) {
      routeFilter = `AND n.filePath CONTAINS $file`;
      queryParams.file = params.file;
    }

    const routes = await this.fetchRoutesWithConsumers(repo.id, routeFilter, queryParams);

    if (routes.length === 0) {
      const target = params.route || params.file;
      return { error: `No routes found matching "${target}".` };
    }

    const flowMap = await this.fetchLinkedFlowsBatch(
      repo.id,
      routes.map((r) => r.id),
    );

    // Count how many routes share the same handler file (for middleware partial detection)
    const routeCountByHandler = new Map<string, number>();
    for (const r of routes) {
      if (r.filePath) {
        routeCountByHandler.set(r.filePath, (routeCountByHandler.get(r.filePath) ?? 0) + 1);
      }
    }

    const results = routes.map((r) => {
      // Keys already normalized by fetchRoutesWithConsumers (quotes stripped)
      const responseKeys = r.responseKeys ?? [];
      const errorKeys = r.errorKeys ?? [];
      const allKnownKeys = new Set([...responseKeys, ...errorKeys]);

      // Build consumer list with mismatch detection
      const consumers = r.consumers.map((c) => ({
        name: c.name,
        file: c.filePath,
        accesses: c.accessedKeys ?? [],
        ...(c.fetchCount && c.fetchCount > 1
          ? {
              attributionNote: `This file fetches ${c.fetchCount} routes — accessed keys may belong to a different route.`,
            }
          : {}),
      }));

      // Detect mismatches: consumer accesses keys not in response shape
      const mismatches: Array<{
        consumer: string;
        field: string;
        reason: string;
        confidence: 'high' | 'low';
      }> = [];
      if (allKnownKeys.size > 0) {
        for (const c of r.consumers) {
          if (!c.accessedKeys) continue;
          const isMultiFetch = (c.fetchCount ?? 1) > 1;
          for (const key of c.accessedKeys) {
            if (!allKnownKeys.has(key)) {
              mismatches.push({
                consumer: c.filePath,
                field: key,
                reason: 'accessed but not in response shape',
                confidence: isMultiFetch ? 'low' : 'high',
              });
            }
          }
        }
      }

      const flows = flowMap.get(r.id) || [];
      const consumerCount = r.consumers.length;

      // Risk level heuristic
      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      if (consumerCount >= 10) {
        riskLevel = 'HIGH';
      } else if (consumerCount >= 4) {
        riskLevel = 'MEDIUM';
      } else {
        riskLevel = 'LOW';
      }
      // Bump up one level if mismatches exist
      if (mismatches.length > 0) {
        if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
        else if (riskLevel === 'MEDIUM') riskLevel = 'HIGH';
      }

      const warning =
        consumerCount > 0
          ? `Changing response shape will affect ${consumerCount} component${consumerCount === 1 ? '' : 's'}`
          : undefined;

      // Flag when middleware was detected but handler exports multiple HTTP methods
      // (middleware chain may only reflect one export)
      const middlewareArr = r.middleware || [];
      const handlerRouteCount = r.filePath ? (routeCountByHandler.get(r.filePath) ?? 1) : 1;
      const middlewarePartial = middlewareArr.length > 0 && handlerRouteCount > 1;

      return {
        route: r.name,
        handler: r.filePath,
        responseShape: {
          success: responseKeys,
          error: errorKeys,
        },
        middleware: middlewareArr,
        ...(middlewarePartial
          ? {
              middlewareDetection: 'partial' as const,
              middlewareNote:
                'Middleware captured from first HTTP method export only — other methods in this handler may use different middleware chains.',
            }
          : {}),
        consumers,
        ...(mismatches.length > 0 ? { mismatches } : {}),
        executionFlows: flows,
        impactSummary: {
          directConsumers: consumerCount,
          affectedFlows: flows.length,
          riskLevel,
          ...(warning ? { warning } : {}),
        },
      };
    });

    // If a single route was targeted, return it directly (not wrapped in array)
    if (results.length === 1) {
      return results[0];
    }

    return { routes: results, total: results.length };
  }

  // ─── Direct Graph Queries (for resources.ts) ────────────────────

  /**
   * Query clusters (communities) directly from graph.
   * Used by getClustersResource — avoids legacy overview() dispatch.
   */
  async queryClusters(repoName?: string, limit = 100): Promise<{ clusters: any[] }> {
    const repo = await this.resolveRepo(repoName);
    await this.ensureInitialized(repo.id);

    try {
      const rawLimit = Math.max(limit * 5, 200);
      const clusters = await executeQuery(
        repo.id,
        `
        MATCH (c:Community)
        RETURN c.id AS id, c.label AS label, c.heuristicLabel AS heuristicLabel, c.cohesion AS cohesion, c.symbolCount AS symbolCount
        ORDER BY c.symbolCount DESC
        LIMIT ${rawLimit}
      `,
      );
      const rawClusters = clusters.map((c: any) => ({
        id: c.id || c[0],
        label: c.label || c[1],
        heuristicLabel: c.heuristicLabel || c[2],
        cohesion: c.cohesion || c[3],
        symbolCount: c.symbolCount || c[4],
      }));
      return { clusters: this.aggregateClusters(rawClusters).slice(0, limit) };
    } catch {
      return { clusters: [] };
    }
  }

  /**
   * Query processes directly from graph.
   * Used by getProcessesResource — avoids legacy overview() dispatch.
   */
  async queryProcesses(repoName?: string, limit = 50): Promise<{ processes: any[] }> {
    const repo = await this.resolveRepo(repoName);
    await this.ensureInitialized(repo.id);

    try {
      const processes = await executeQuery(
        repo.id,
        `
        MATCH (p:Process)
        RETURN p.id AS id, p.label AS label, p.heuristicLabel AS heuristicLabel, p.processType AS processType, p.processSubtype AS processSubtype, p.runtimeChainConfidence AS runtimeChainConfidence, p.stepCount AS stepCount
        ORDER BY p.stepCount DESC
        LIMIT ${limit}
      `,
      );
      return {
        processes: processes.map((p: any) => ({
          id: p.id || p[0],
          label: p.label || p[1],
          heuristicLabel: p.heuristicLabel || p[2],
          processType: p.processType || p[3],
          processSubtype: p.processSubtype || p[4],
          runtimeChainConfidence: p.runtimeChainConfidence || p[5],
          stepCount: p.stepCount || p[6],
        })),
      };
    } catch {
      return { processes: [] };
    }
  }

  /**
   * Query cluster detail (members) directly from graph.
   * Used by getClusterDetailResource.
   */
  async queryClusterDetail(name: string, repoName?: string): Promise<any> {
    const repo = await this.resolveRepo(repoName);
    await this.ensureInitialized(repo.id);

    const clusters = await executeParameterized(
      repo.id,
      `
      MATCH (c:Community)
      WHERE c.label = $clusterName OR c.heuristicLabel = $clusterName
      RETURN c.id AS id, c.label AS label, c.heuristicLabel AS heuristicLabel, c.cohesion AS cohesion, c.symbolCount AS symbolCount
    `,
      { clusterName: name },
    );
    if (clusters.length === 0) return { error: `Cluster '${name}' not found` };

    const rawClusters = clusters.map((c: any) => ({
      id: c.id || c[0],
      label: c.label || c[1],
      heuristicLabel: c.heuristicLabel || c[2],
      cohesion: c.cohesion || c[3],
      symbolCount: c.symbolCount || c[4],
    }));

    let totalSymbols = 0,
      weightedCohesion = 0;
    for (const c of rawClusters) {
      const s = c.symbolCount || 0;
      totalSymbols += s;
      weightedCohesion += (c.cohesion || 0) * s;
    }

    const members = await executeParameterized(
      repo.id,
      `
      MATCH (n)-[:CodeRelation {type: 'MEMBER_OF'}]->(c:Community)
      WHERE c.label = $clusterName OR c.heuristicLabel = $clusterName
      RETURN DISTINCT n.name AS name, labels(n)[0] AS type, n.filePath AS filePath
      LIMIT 30
    `,
      { clusterName: name },
    );

    return {
      cluster: {
        id: rawClusters[0].id,
        label: rawClusters[0].heuristicLabel || rawClusters[0].label,
        heuristicLabel: rawClusters[0].heuristicLabel || rawClusters[0].label,
        cohesion: totalSymbols > 0 ? weightedCohesion / totalSymbols : 0,
        symbolCount: totalSymbols,
        subCommunities: rawClusters.length,
      },
      members: members.map((m: any) => ({
        name: m.name || m[0],
        type: m.type || m[1],
        filePath: m.filePath || m[2],
      })),
    };
  }

  /**
   * Query process detail (steps) directly from graph.
   * Used by getProcessDetailResource.
   */
  async queryProcessDetail(name: string, repoName?: string): Promise<any> {
    const repo = await this.resolveRepo(repoName);
    await this.ensureInitialized(repo.id);

    const byId = await executeParameterized(repo.id, `
      MATCH (p:Process)
      WHERE p.id = $processName
      RETURN p.id AS id, p.label AS label, p.heuristicLabel AS heuristicLabel, p.processType AS processType, p.processSubtype AS processSubtype, p.runtimeChainConfidence AS runtimeChainConfidence, p.stepCount AS stepCount
      LIMIT 1
    `, { processName: name });

    const processes = byId.length > 0 ? byId : await executeParameterized(repo.id, `
      MATCH (p:Process)
      WHERE p.label = $processName OR p.heuristicLabel = $processName
      RETURN p.id AS id, p.label AS label, p.heuristicLabel AS heuristicLabel, p.processType AS processType, p.processSubtype AS processSubtype, p.runtimeChainConfidence AS runtimeChainConfidence, p.stepCount AS stepCount
      LIMIT 1
    `,
      { processName: name },
    );
    if (processes.length === 0) return { error: `Process '${name}' not found` };

    const proc = processes[0];
    const procId = proc.id || proc[0];
    const steps = await executeParameterized(
      repo.id,
      `
      MATCH (n)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p {id: $procId})
      RETURN n.name AS name, labels(n)[0] AS type, n.filePath AS filePath, r.step AS step, r.reason AS reason, r.confidence AS confidence
      ORDER BY r.step
    `,
      { procId },
    );

    return {
      process: {
        id: procId, label: proc.label || proc[1], heuristicLabel: proc.heuristicLabel || proc[2],
        processType: proc.processType || proc[3],
        processSubtype: proc.processSubtype || proc[4],
        runtimeChainConfidence: proc.runtimeChainConfidence || proc[5],
        stepCount: proc.stepCount || proc[6],
      },
      steps: steps.map((s: any) => ({
        step: s.step || s[3],
        reason: s.reason || s[4],
        confidence: s.confidence || s[5],
        name: s.name || s[0],
        type: s.type || s[1],
        filePath: s.filePath || s[2],
      })),
    };
  }

  async disconnect(): Promise<void> {
    await closeLbug(); // close all connections
    // Note: we intentionally do NOT call disposeEmbedder() here.
    // ONNX Runtime's native cleanup segfaults on macOS and some Linux configs,
    // and importing the embedder module on Node v24+ crashes if onnxruntime
    // was never loaded during the session. Since process.exit(0) follows
    // immediately after disconnect(), the OS reclaims everything. See #38, #89.
    this.repos.clear();
    this.contextCache.clear();
    this.initializedRepos.clear();
  }
}
