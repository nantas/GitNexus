/**
 * Process Detection Processor
 *
 * Detects execution flows (Processes) in the code graph by:
 * 1. Finding entry points (functions with no internal callers)
 * 2. Tracing forward via CALLS edges (BFS)
 * 3. Grouping and deduplicating similar paths
 * 4. Labeling with heuristic names
 *
 * Processes help agents understand how features work through the codebase.
 */

import type { GraphNode, NodeLabel } from 'gitnexus-shared';
import { KnowledgeGraph } from '../graph/types.js';
import { CommunityMembership } from './community-processor.js';
import { calculateEntryPointScore, isTestFile } from './entry-point-scoring.js';
import { SupportedLanguages } from '../../config/supported-languages.js';

const isDev = process.env.NODE_ENV === 'development';
const SYNTHETIC_RUNTIME_ROOT_MARKER = 'unity-runtime-root';
const SYNTHETIC_RUNTIME_ROOT_TRACE_LIMIT = 8;

import { logger } from '../logger.js';
// ============================================================================
// CONFIGURATION
// ============================================================================

export interface ProcessDetectionConfig {
  maxTraceDepth: number; // Maximum steps to trace (default: 10)
  maxBranching: number; // Max branches to follow per node (default: 3)
  maxProcesses: number; // Maximum processes to detect (default: 50)
  minSteps: number; // Minimum steps for a valid process (default: 2)
}

const DEFAULT_CONFIG: ProcessDetectionConfig = {
  maxTraceDepth: 10,
  maxBranching: 4,
  maxProcesses: 75,
  minSteps: 3, // 3+ steps = genuine multi-hop flow (2-step is just "A calls B")
};

// ============================================================================
// TYPES
// ============================================================================

export interface ProcessNode {
  id: string; // "proc_handleLogin_createSession"
  label: string; // "HandleLogin → CreateSession"
  heuristicLabel: string;
  processType: 'intra_community' | 'cross_community';
  processSubtype: 'unity_lifecycle' | 'static_calls';
  runtimeChainConfidence: 'high' | 'medium';
  sourceReasons: string[];
  sourceConfidences: number[];
  stepCount: number;
  communities: string[]; // Community IDs touched
  entryPointId: string;
  terminalId: string;
  trace: string[]; // Ordered array of node IDs
}

export interface ProcessStep {
  nodeId: string;
  processId: string;
  step: number;                  // 1-indexed position in trace
  reason?: string;
  confidence?: number;
}

export interface ProcessDetectionResult {
  processes: ProcessNode[];
  steps: ProcessStep[];
  stats: {
    totalProcesses: number;
    crossCommunityCount: number;
    avgStepCount: number;
    entryPointsFound: number;
  };
}

// ============================================================================
// MAIN PROCESSOR
// ============================================================================

/**
 * Detect processes (execution flows) in the knowledge graph
 *
 * This runs AFTER community detection, using CALLS edges to trace flows.
 */
export const processProcesses = async (
  knowledgeGraph: KnowledgeGraph,
  memberships: CommunityMembership[],
  onProgress?: (message: string, progress: number) => void,
  config: Partial<ProcessDetectionConfig> = {},
): Promise<ProcessDetectionResult> => {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  onProgress?.('Finding entry points...', 0);

  // Build lookup maps
  const membershipMap = new Map<string, string>();
  memberships.forEach((m) => membershipMap.set(m.nodeId, m.communityId));

  const callsEdges = buildCallsGraph(knowledgeGraph);
  const callsEvidenceMap = buildCallsEvidenceMap(knowledgeGraph);
  const reverseCallsEdges = buildReverseCallsGraph(knowledgeGraph);
  const nodeMap = new Map<string, GraphNode>();
  for (const n of knowledgeGraph.iterNodes()) nodeMap.set(n.id, n);

  // Step 1: Find entry points (functions that call others but have few callers)
  const entryPoints = findEntryPoints(knowledgeGraph, reverseCallsEdges, callsEdges);

  onProgress?.(`Found ${entryPoints.length} entry points, tracing flows...`, 20);

  onProgress?.(`Found ${entryPoints.length} entry points, tracing flows...`, 20);

  // Step 2: Trace processes from each entry point
  const allTraces: string[][] = [];

  for (let i = 0; i < entryPoints.length && allTraces.length < cfg.maxProcesses * 2; i++) {
    const entryId = entryPoints[i];
    const traces = traceFromEntryPoint(entryId, callsEdges, cfg);

    // Filter out traces that are too short
    traces.filter((t) => t.length >= cfg.minSteps).forEach((t) => allTraces.push(t));

    if (i % 10 === 0) {
      onProgress?.(
        `Tracing entry point ${i + 1}/${entryPoints.length}...`,
        20 + (i / entryPoints.length) * 40,
      );
    }
  }

  onProgress?.(`Found ${allTraces.length} traces, deduplicating...`, 60);

  // Step 3: Deduplicate similar traces (subset removal)
  const uniqueTraces = deduplicateTraces(allTraces);

  // Step 3b: Deduplicate by entry+terminal pair (keep longest path per pair)
  const endpointDeduped = deduplicateByEndpoints(uniqueTraces);
  const syntheticRootBounded = capSyntheticRuntimeRootTraces(endpointDeduped);
  
  onProgress?.(`Deduped ${uniqueTraces.length} → ${syntheticRootBounded.length} unique endpoint pairs`, 70);
  
  // Step 4: Limit to max processes (prioritize longer traces)
  const sortedTraces = syntheticRootBounded.sort((a, b) => {
    const runtimeScore = scoreSyntheticRuntimeTrace(b) - scoreSyntheticRuntimeTrace(a);
    if (runtimeScore !== 0) return runtimeScore;
    return b.length - a.length;
  });
  const prioritizedRuntimeTraces = sortedTraces
    .filter(isSyntheticRuntimeRootTrace)
    .slice(0, SYNTHETIC_RUNTIME_ROOT_TRACE_LIMIT);
  const prioritizedRuntimeKeys = new Set(prioritizedRuntimeTraces.map((trace) => trace.join('->')));
  const limitedTraces = [
    ...prioritizedRuntimeTraces,
    ...sortedTraces.filter((trace) => !prioritizedRuntimeKeys.has(trace.join('->'))),
  ].slice(0, cfg.maxProcesses);
  
  onProgress?.(`Creating ${limitedTraces.length} process nodes...`, 80);

  // Step 5: Create process nodes
  const processes: ProcessNode[] = [];
  const steps: ProcessStep[] = [];

  limitedTraces.forEach((trace, idx) => {
    const entryPointId = trace[0];
    const terminalId = trace[trace.length - 1];
    const traceEvidence = collectTraceEvidence(trace, callsEvidenceMap);
    
    // Get communities touched
    const communitiesSet = new Set<string>();
    trace.forEach((nodeId) => {
      const comm = membershipMap.get(nodeId);
      if (comm) communitiesSet.add(comm);
    });
    const communities = Array.from(communitiesSet);

    // Determine process type
    const processType: 'intra_community' | 'cross_community' =
      communities.length > 1 ? 'cross_community' : 'intra_community';
    const processSubtype: 'unity_lifecycle' | 'static_calls' =
      isSyntheticRuntimeRootTrace(trace) ? 'unity_lifecycle' : 'static_calls';
    const sourceReasons = Array.from(
      new Set(
        traceEvidence
          .map((edge) => edge.reason?.trim())
          .filter((reason): reason is string => Boolean(reason) && !/TODO|TBD|placeholder/i.test(reason)),
      ),
    );
    const sourceConfidences = Array.from(
      new Set(
        traceEvidence
          .map((edge) => edge.confidence)
          .filter((confidence): confidence is number => Number.isFinite(confidence)),
      ),
    );
    const runtimeChainConfidence: 'high' | 'medium' =
      sourceReasons.some(isSyntheticLifecycleReason) ? 'medium' : 'high';
    
    // Generate label
    const entryNode = nodeMap.get(entryPointId);
    const terminalNode = nodeMap.get(terminalId);
    const entryName = entryNode?.properties.name || 'Unknown';
    const terminalName = terminalNode?.properties.name || 'Unknown';
    const heuristicLabel = `${capitalize(entryName)} → ${capitalize(terminalName)}`;

    const processId = `proc_${idx}_${sanitizeId(entryName)}`;

    processes.push({
      id: processId,
      label: heuristicLabel,
      heuristicLabel,
      processType,
      processSubtype,
      runtimeChainConfidence,
      sourceReasons,
      sourceConfidences,
      stepCount: trace.length,
      communities,
      entryPointId,
      terminalId,
      trace,
    });

    // Create step relationships
    trace.forEach((nodeId, stepIdx) => {
      const edgeEvidence = resolveStepEvidence(trace, stepIdx, callsEvidenceMap);
      steps.push({
        nodeId,
        processId,
        step: stepIdx + 1,  // 1-indexed
        reason: edgeEvidence?.reason,
        confidence: edgeEvidence?.confidence,
      });
    });
  });

  onProgress?.('Process detection complete!', 100);

  // Calculate stats
  const crossCommunityCount = processes.filter((p) => p.processType === 'cross_community').length;
  const avgStepCount =
    processes.length > 0
      ? processes.reduce((sum, p) => sum + p.stepCount, 0) / processes.length
      : 0;

  return {
    processes,
    steps,
    stats: {
      totalProcesses: processes.length,
      crossCommunityCount,
      avgStepCount: Math.round(avgStepCount * 10) / 10,
      entryPointsFound: entryPoints.length,
    },
  };
};

// ============================================================================
// HELPER: Build CALLS adjacency list
// ============================================================================

type AdjacencyList = Map<string, string[]>;
type CallsEvidence = { reason?: string; confidence: number };
type CallsEvidenceMap = Map<string, CallsEvidence>;

/**
 * Minimum edge confidence for process tracing.
 * Filters out ambiguous fuzzy-global matches (0.3) that cause
 * traces to jump across unrelated code areas.
 */
const MIN_TRACE_CONFIDENCE = 0.5;

const buildCallsGraph = (graph: KnowledgeGraph): AdjacencyList => {
  const adj = new Map<string, string[]>();

  for (const rel of graph.iterRelationships()) {
    if (rel.type === 'CALLS' && rel.confidence >= MIN_TRACE_CONFIDENCE) {
      if (!adj.has(rel.sourceId)) {
        adj.set(rel.sourceId, []);
      }
      adj.get(rel.sourceId)!.push(rel.targetId);
    }
  }

  return adj;
};

const buildReverseCallsGraph = (graph: KnowledgeGraph): AdjacencyList => {
  const adj = new Map<string, string[]>();

  for (const rel of graph.iterRelationships()) {
    if (rel.type === 'CALLS' && rel.confidence >= MIN_TRACE_CONFIDENCE) {
      if (!adj.has(rel.targetId)) {
        adj.set(rel.targetId, []);
      }
      adj.get(rel.targetId)!.push(rel.sourceId);
    }
  }

  return adj;
};

const buildCallsEvidenceMap = (graph: KnowledgeGraph): CallsEvidenceMap => {
  const evidenceMap: CallsEvidenceMap = new Map();

  for (const rel of graph.iterRelationships()) {
    if (rel.type !== 'CALLS' || rel.confidence < MIN_TRACE_CONFIDENCE) continue;

    const key = `${rel.sourceId}->${rel.targetId}`;
    const existing = evidenceMap.get(key);
    if (!existing || rel.confidence >= existing.confidence) {
      evidenceMap.set(key, {
        reason: rel.reason,
        confidence: rel.confidence,
      });
    }
  }

  return evidenceMap;
};

const collectTraceEvidence = (trace: string[], callsEvidenceMap: CallsEvidenceMap): CallsEvidence[] => {
  const evidence: CallsEvidence[] = [];
  for (let i = 0; i < trace.length - 1; i++) {
    const edge = callsEvidenceMap.get(`${trace[i]}->${trace[i + 1]}`);
    if (edge) evidence.push(edge);
  }
  return evidence;
};

const resolveStepEvidence = (
  trace: string[],
  stepIdx: number,
  callsEvidenceMap: CallsEvidenceMap,
): CallsEvidence | undefined => {
  const current = trace[stepIdx];
  const next = trace[stepIdx + 1];
  if (next) {
    const outgoing = callsEvidenceMap.get(`${current}->${next}`);
    if (outgoing) return outgoing;
  }

  const prev = trace[stepIdx - 1];
  if (!prev) return undefined;
  return callsEvidenceMap.get(`${prev}->${current}`);
};

const isSyntheticLifecycleReason = (reason: string): boolean =>
  reason.includes('unity-lifecycle-synthetic') || reason.includes('unity-runtime-loader-synthetic');

/**
 * Find functions/methods that are good entry points for tracing.
 *
 * Entry points are scored based on:
 * 1. Call ratio (calls many, called by few)
 * 2. Export status (exported/public functions rank higher)
 * 3. Name patterns (handle*, on*, *Controller, etc.)
 *
 * Test files are excluded entirely.
 */
const findEntryPoints = (
  graph: KnowledgeGraph,
  reverseCallsEdges: AdjacencyList,
  callsEdges: AdjacencyList,
): string[] => {
  const symbolTypes = new Set<NodeLabel>(['Function', 'Method']);
  const entryPointCandidates: {
    id: string;
    score: number;
    reasons: string[];
  }[] = [];

  for (const node of graph.iterNodes()) {
    if (!symbolTypes.has(node.label)) continue;

    const filePath = node.properties.filePath || '';

    // Skip test files entirely
    if (isTestFile(filePath)) continue;

    const callers = reverseCallsEdges.get(node.id) || [];
    const callees = callsEdges.get(node.id) || [];

    // Must have at least 1 outgoing call to trace forward
    if (callees.length === 0) continue;

    if (node.id.includes(SYNTHETIC_RUNTIME_ROOT_MARKER) || String(node.properties.name || '').includes(SYNTHETIC_RUNTIME_ROOT_MARKER)) {
      entryPointCandidates.push({
        id: node.id,
        score: 10_000 + callees.length,
        reasons: ['synthetic-runtime-root'],
      });
      continue;
    }

    // Calculate entry point score using new scoring system
    const { score: baseScore, reasons } = calculateEntryPointScore(
      node.properties.name,
      (node.properties.language ?? SupportedLanguages.JavaScript) as SupportedLanguages,
      node.properties.isExported ?? false,
      callers.length,
      callees.length,
      filePath, // Pass filePath for framework detection
    );

    let score = baseScore;
    const astFrameworkMultiplier = node.properties.astFrameworkMultiplier ?? 1.0;
    if (astFrameworkMultiplier > 1.0) {
      score *= astFrameworkMultiplier;
      reasons.push(`framework-ast:${node.properties.astFrameworkReason || 'decorator'}`);
    }

    if (score > 0) {
      entryPointCandidates.push({ id: node.id, score, reasons });
    }
  }

  // Sort by score descending and return top candidates
  const sorted = entryPointCandidates.sort((a, b) => b.score - a.score);

  // DEBUG: Log top candidates with new scoring details
  if (sorted.length > 0 && isDev) {
    logger.info(`[Process] Top 10 entry point candidates (new scoring):`);
    sorted.slice(0, 10).forEach((c, i) => {
      const node = graph.getNode(c.id);
      const exported = node?.properties.isExported ? '✓' : '✗';
      const shortPath = node?.properties.filePath?.split('/').slice(-2).join('/') || '';
      logger.info(`  ${i + 1}. ${node?.properties.name} [exported:${exported}] (${shortPath})`);
      logger.info(`     score: ${c.score.toFixed(2)} = [${c.reasons.join(' × ')}]`);
    });
  }

  return sorted
    .slice(0, 200) // Limit to prevent explosion
    .map((c) => c.id);
};

// ============================================================================
// HELPER: Trace from entry point (BFS)
// ============================================================================

/**
 * Trace forward from an entry point using BFS.
 * Returns all distinct paths up to maxDepth.
 */
const traceFromEntryPoint = (
  entryId: string,
  callsEdges: AdjacencyList,
  config: ProcessDetectionConfig,
): string[][] => {
  const traces: string[][] = [];
  const isRuntimeRootEntry = entryId.includes(SYNTHETIC_RUNTIME_ROOT_MARKER);
  const maxTraceCount = isRuntimeRootEntry ? SYNTHETIC_RUNTIME_ROOT_TRACE_LIMIT * 6 : config.maxBranching * 3;
  
  // BFS with path tracking
  // Each queue item: [currentNodeId, pathSoFar]
  const queue: [string, string[]][] = [[entryId, [entryId]]];

  while (queue.length > 0 && traces.length < maxTraceCount) {
    const [currentId, path] = queue.shift()!;

    // Get outgoing calls
    const callees = callsEdges.get(currentId) || [];

    if (callees.length === 0) {
      // Terminal node - this is a complete trace
      if (path.length >= config.minSteps) {
        traces.push([...path]);
      }
    } else if (path.length >= config.maxTraceDepth) {
      // Max depth reached - save what we have
      if (path.length >= config.minSteps) {
        traces.push([...path]);
      }
    } else {
      // Continue tracing - limit branching
      const branchingLimit =
        path.length === 1 && currentId.includes(SYNTHETIC_RUNTIME_ROOT_MARKER)
          ? Math.min(callees.length, Math.max(config.maxBranching * 8, SYNTHETIC_RUNTIME_ROOT_TRACE_LIMIT * 4))
          : config.maxBranching;
      const orderedCallees = isRuntimeRootEntry
        ? [...callees].sort((left, right) => scoreRuntimeTraceTarget(right) - scoreRuntimeTraceTarget(left))
        : callees;
      const limitedCallees = orderedCallees.slice(0, branchingLimit);
      let addedBranch = false;

      for (const calleeId of limitedCallees) {
        // Avoid cycles
        if (!path.includes(calleeId)) {
          queue.push([calleeId, [...path, calleeId]]);
          addedBranch = true;
        }
      }

      // If all branches were cycles, save current path as terminal
      if (!addedBranch && path.length >= config.minSteps) {
        traces.push([...path]);
      }
    }
  }

  return traces;
};

// ============================================================================
// HELPER: Deduplicate traces
// ============================================================================

/**
 * Merge traces that are subsets of other traces.
 * Keep longer traces, remove redundant shorter ones.
 */
const deduplicateTraces = (traces: string[][]): string[][] => {
  if (traces.length === 0) return [];

  // Sort by length descending
  const sorted = [...traces].sort((a, b) => b.length - a.length);
  const unique: string[][] = [];

  for (const trace of sorted) {
    // Check if this trace is a subset of any already-added trace
    const traceKey = trace.join('->');
    const isSubset = unique.some((existing) => {
      const existingKey = existing.join('->');
      return existingKey.includes(traceKey);
    });

    if (!isSubset) {
      unique.push(trace);
    }
  }

  return unique;
};

// ============================================================================
// HELPER: Deduplicate by entry+terminal endpoints
// ============================================================================

/**
 * Keep only the longest trace per unique entry→terminal pair.
 * Multiple paths between the same two endpoints are redundant for agents.
 */
const deduplicateByEndpoints = (traces: string[][]): string[][] => {
  if (traces.length === 0) return [];

  const byEndpoints = new Map<string, string[]>();
  // Sort longest first so the first seen per key is the longest
  const sorted = [...traces].sort((a, b) => b.length - a.length);

  for (const trace of sorted) {
    const key = isSyntheticRuntimeRootTrace(trace)
      ? `${trace[0]}::${trace[1] ?? ''}::${trace[trace.length - 1]}`
      : `${trace[0]}::${trace[trace.length - 1]}`;
    if (!byEndpoints.has(key)) {
      byEndpoints.set(key, trace);
    }
  }

  return Array.from(byEndpoints.values());
};

/**
 * Keep synthetic runtime-root traces useful but bounded.
 * Preserve a small set of distinct lifecycle/runtime traces instead of collapsing to one.
 */
const capSyntheticRuntimeRootTraces = (traces: string[][]): string[][] => {
  if (traces.length === 0) return [];

  const runtimeRootTraces = traces
    .filter(isSyntheticRuntimeRootTrace)
    .sort((a, b) => scoreSyntheticRuntimeTrace(b) - scoreSyntheticRuntimeTrace(a));

  if (runtimeRootTraces.length <= SYNTHETIC_RUNTIME_ROOT_TRACE_LIMIT) return traces;

  const keep = runtimeRootTraces.slice(0, SYNTHETIC_RUNTIME_ROOT_TRACE_LIMIT);
  const filtered = traces.filter((trace) => !isSyntheticRuntimeRootTrace(trace));
  filtered.push(...keep);
  return filtered;
};

const isSyntheticRuntimeRootTrace = (trace: string[]): boolean =>
  Boolean(trace[0]?.includes(SYNTHETIC_RUNTIME_ROOT_MARKER));

const scoreSyntheticRuntimeTrace = (trace: string[]): number => {
  let score = trace.length * 100;
  const joined = trace.join(' ');

  if (joined.includes('RegisterGraphEvents')) score += 80;
  if (joined.includes('RegisterEvents')) score += 60;
  if (joined.includes('StartRoutineWithEvents')) score += 60;
  if (joined.includes('GetValue')) score += 70;
  if (joined.includes('CheckReload')) score += 60;
  if (joined.includes('ReloadRoutine')) score += 60;
  if (joined.includes('EquipWithEvent')) score += 40;
  if (joined.includes('Equip')) score += 30;

  return score;
};

const scoreRuntimeRootTarget = (nodeId: string): number => {
  let score = 0;
  const text = String(nodeId || '');

  if (text.includes('GunGraphMB')) score += 200;
  if (text.includes('MeleeGraphMB')) score += 120;
  if (text.includes('/Reload')) score += 180;
  if (text.includes('/Graph/')) score += 100;
  if (text.includes('/PowerUps/')) score += 70;
  if (text.includes('/Core/')) score += 40;
  if (text.includes(':OnEnable')) score += 30;
  if (text.includes(':Awake')) score += 20;
  if (text.includes(':Start')) score += 10;

  return score;
};

const scoreRuntimeTraceTarget = (nodeId: string): number => {
  const text = String(nodeId || '');
  let score = scoreRuntimeRootTarget(text);

  if (text.includes('RegisterGraphEvents')) score += 220;
  if (text.includes('RegisterEvents')) score += 180;
  if (text.includes('StartRoutineWithEvents')) score += 260;
  if (text.includes('GetValue')) score += 200;
  if (text.includes('CheckReload')) score += 180;
  if (text.includes('ReloadRoutine')) score += 170;
  if (text.includes('AttackRoutineWithEvents')) score -= 80;
  if (text.includes('IGraphEvent.cs:Register')) score -= 140;
  if (text.includes('WaitForHelper.cs:EndOfFrame')) score -= 160;
  if (text.includes('/Graph/Graphs/GunGraph.cs')) score += 120;
  if (text.includes('/Graph/Nodes/Reloads/ReloadBase.cs')) score += 220;
  if (text.includes('/Graph/Nodes/Reloads/Reload.cs')) score += 180;
  if (text.includes('/Graph/Nodes/Reloads/')) score += 120;

  return score;
};

// ============================================================================
// HELPER: String utilities
// ============================================================================

const capitalize = (s: string): string => {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const sanitizeId = (s: string): string => {
  return s
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 20)
    .toLowerCase();
};
