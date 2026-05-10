import type { RuntimeChainEvidenceLevel } from './runtime-chain-evidence.js';
import { type RuntimeClaim } from './runtime-claim.js';
import { extractRuntimeGraphCandidates } from './runtime-chain-graph-candidates.js';
import { evaluateRuntimeClosure } from './runtime-chain-closure-evaluator.js';

export type RuntimeChainVerifyMode = 'off' | 'on-demand';
export type RuntimeChainStatus = 'pending' | 'verified_partial' | 'verified_full' | 'failed';
export type RuntimeChainHopType = 'resource' | 'guid_map' | 'code_loader' | 'code_runtime';

export interface RuntimeChainHop {
  hop_type: RuntimeChainHopType;
  anchor: string;
  confidence: 'low' | 'medium' | 'high';
  note: string;
  snippet?: string;
}

export interface RuntimeChainGap {
  segment: 'resource' | 'guid_map' | 'loader' | 'runtime';
  reason: string;
  next_command: string;
  why_not_next?: string;
}

export interface RuntimeChainResult {
  status: RuntimeChainStatus;
  evidence_level: RuntimeChainEvidenceLevel;
  evidence_source?: 'analyze_time' | 'query_time';
  hops: RuntimeChainHop[];
  gaps: RuntimeChainGap[];
  why_not_next?: string[];
}

interface QueryExecutor {
  (query: string, params?: Record<string, unknown>): Promise<any[]>;
}

interface VerifyRuntimeChainInput {
  repoPath: string;
  executeParameterized: QueryExecutor;
  queryText?: string;
  resourceSeedPath?: string;
  mappedSeedTargets?: string[];
  symbolName?: string;
  symbolFilePath?: string;
  resourceBindings?: Array<{ resourcePath?: string }>;
  requiredHops?: string[];
}
interface VerifyRuntimeClaimInput extends VerifyRuntimeChainInput {
  rulesRoot?: string;
  minimumEvidenceSatisfied?: boolean;
}

function hasStructuredVerifierAnchors(input: VerifyRuntimeChainInput): boolean {
  const hasValue = (value: unknown): boolean => String(value || '').trim().length > 0;
  if (hasValue(input.resourceSeedPath)) return true;
  if (hasValue(input.symbolName)) return true;
  if (hasValue(input.symbolFilePath)) return true;
  if (Array.isArray(input.mappedSeedTargets) && input.mappedSeedTargets.some((value) => hasValue(value))) return true;
  if (
    Array.isArray(input.resourceBindings)
    && input.resourceBindings.some((binding) => hasValue(binding?.resourcePath))
  ) return true;
  return false;
}

function toGraphOnlyRuntimeChainResult(input: {
  queryText?: string;
  symbolName?: string;
  resourceSeedPath?: string;
  mappedSeedTargets?: string[];
  resourceBindings?: Array<{ resourcePath?: string }>;
  candidates: Awaited<ReturnType<typeof extractRuntimeGraphCandidates>>;
}): RuntimeChainResult {
  const nextCommand = buildDefaultVerifyNextCommand({
    queryText: input.queryText,
    symbolName: input.symbolName,
    resourceSeedPath: input.resourceSeedPath,
  });
  const closure = evaluateRuntimeClosure({
    queryText: input.queryText,
    symbolName: input.symbolName,
    resourceSeedPath: input.resourceSeedPath,
    mappedSeedTargets: input.mappedSeedTargets,
    resourceBindings: input.resourceBindings,
    candidates: input.candidates,
    nextCommand,
  });

  const hops: RuntimeChainHop[] = input.candidates.slice(0, 20).map((candidate) => ({
    hop_type: String(candidate.reason || '').startsWith('unity-rule-')
      || String(candidate.reason || '').toLowerCase().includes('bridge')
      ? 'code_loader'
      : 'code_runtime',
    anchor: `${candidate.sourceFilePath || candidate.sourceName}:${candidate.sourceStartLine || 1}->${candidate.targetFilePath || candidate.targetName}:${candidate.targetStartLine || 1}`,
    confidence: String(candidate.reason || '').startsWith('unity-rule-') ? 'high' : 'medium',
    note: String(candidate.reason || '').startsWith('unity-rule-')
      ? `Synthetic edge observed in graph (${candidate.reason}).`
      : 'Graph continuity candidate from structured anchors.',
    snippet: `${candidate.sourceName} -> ${candidate.targetName}`,
  }));

  return {
    status: closure.status,
    evidence_level: closure.evidence_level,
    evidence_source: 'query_time',
    hops,
    gaps: closure.gaps,
  };
}

function resolveFollowUpSubject(input: {
  queryText?: string;
  symbolName?: string;
  resourceSeedPath?: string;
}): string {
  const seedPath = String(input.resourceSeedPath || '').trim();
  if (seedPath) return seedPath;
  const symbolName = String(input.symbolName || '').trim();
  if (symbolName) return symbolName;
  const queryText = String(input.queryText || '').trim();
  if (queryText) return queryText;
  return 'unity-runtime-chain';
}

function buildDefaultVerifyNextCommand(input: {
  queryText?: string;
  symbolName?: string;
  resourceSeedPath?: string;
}): string {
  const escapedQuery = resolveFollowUpSubject(input)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  return `node gitnexus/dist/cli/index.js query --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand "${escapedQuery}"`;
}

export async function verifyRuntimeChainOnDemand(
  input: VerifyRuntimeChainInput,
): Promise<RuntimeChainResult | undefined> {
  if (!hasStructuredVerifierAnchors(input) || !String(input.symbolName || '').trim()) return undefined;
  const candidates = await extractRuntimeGraphCandidates({
    executeParameterized: input.executeParameterized,
    symbolName: input.symbolName,
    symbolFilePath: input.symbolFilePath,
  });
  return toGraphOnlyRuntimeChainResult({
    queryText: input.queryText,
    symbolName: input.symbolName,
    resourceSeedPath: input.resourceSeedPath,
    mappedSeedTargets: input.mappedSeedTargets,
    resourceBindings: input.resourceBindings,
    candidates,
  });
}
function buildFailureRuntimeClaim(input: {
  reason: RuntimeClaim['reason'];
  next_action: string;
}): RuntimeClaim {
  return {
    rule_id: 'none',
    rule_version: '0.0.0',
    scope: {
      resource_types: [],
      host_base_type: [],
      trigger_family: 'none',
    },
    status: 'failed',
    evidence_level: 'none',
    guarantees: [],
    non_guarantees: ['runtime_chain_verification_not_executed'],
    hops: [],
    gaps: [],
    reason: input.reason,
    next_action: input.next_action,
  };
}

function buildGraphOnlyRuntimeClaim(input: {
  runtimeChain: RuntimeChainResult;
  queryText?: string;
  symbolName?: string;
  resourceSeedPath?: string;
  minimumEvidenceSatisfied?: boolean;
}): RuntimeClaim {
  const normalizedStatus: RuntimeClaim['status'] = (
    input.runtimeChain.status === 'pending' ? 'failed' : input.runtimeChain.status
  );
  const verificationFailed = normalizedStatus === 'failed'
    || (input.runtimeChain.evidence_level === 'none' && normalizedStatus !== 'verified_full');
  const nextAction = buildDefaultVerifyNextCommand({
    queryText: input.queryText,
    symbolName: input.symbolName,
    resourceSeedPath: input.resourceSeedPath,
  });

  const base: RuntimeClaim = {
    rule_id: 'graph-only.runtime-closure.v1',
    rule_version: '1.0.0',
    scope: {
      resource_types: ['asset', 'prefab', 'unity'],
      host_base_type: input.symbolName ? [input.symbolName] : [],
      trigger_family: 'graph_only',
    },
    status: verificationFailed ? 'failed' : normalizedStatus,
    evidence_level: input.runtimeChain.evidence_level,
    guarantees: (!verificationFailed && normalizedStatus === 'verified_full')
      ? ['runtime_chain_graph_closure']
      : [],
    non_guarantees: [
      'no_runtime_execution',
      'no_dynamic_data_flow_proof',
      'no_state_transition_proof',
    ],
    hops: input.runtimeChain.hops,
    gaps: input.runtimeChain.gaps,
    ...(verificationFailed
      ? {
        reason: 'rule_matched_but_verification_failed' as const,
        next_action: nextAction,
      }
      : {}),
  };

  const chainClosed = base.status === 'verified_full'
    && base.evidence_level === 'verified_chain'
    && base.gaps.length === 0;
  if (input.minimumEvidenceSatisfied === false && !chainClosed) {
    return {
      ...base,
      status: 'failed',
      evidence_level: 'clue',
      guarantees: [],
      non_guarantees: [...base.non_guarantees, 'minimum_evidence_contract_not_satisfied'],
      reason: 'rule_matched_but_evidence_missing',
      next_action: nextAction,
    };
  }

  return base;
}
export async function verifyRuntimeClaimOnDemand(
  input: VerifyRuntimeClaimInput,
): Promise<RuntimeClaim> {
  const fallbackNextAction = buildDefaultVerifyNextCommand({
    queryText: input.queryText,
    symbolName: input.symbolName,
    resourceSeedPath: input.resourceSeedPath,
  });
  if (!hasStructuredVerifierAnchors(input)) {
    return buildFailureRuntimeClaim({
      reason: 'rule_not_matched',
      next_action: fallbackNextAction,
    });
  }

  const graphOnlyRuntimeChain = await verifyRuntimeChainOnDemand(input);
  if (graphOnlyRuntimeChain) {
    return buildGraphOnlyRuntimeClaim({
      runtimeChain: graphOnlyRuntimeChain,
      queryText: input.queryText,
      symbolName: input.symbolName,
      resourceSeedPath: input.resourceSeedPath,
      minimumEvidenceSatisfied: input.minimumEvidenceSatisfied,
    });
  }
  return buildFailureRuntimeClaim({
    reason: 'rule_not_matched',
    next_action: fallbackNextAction,
  });
}
