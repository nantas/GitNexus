import { logger } from '../../logger.js';
import { createHash } from 'node:crypto';
import { isHeuristicEdgeReason } from '../../graph/edge-reasons.js';
import type { PipelinePhase } from './types.js';
import { getPhaseOutput } from './types.js';
import type { ProcessesOutput } from './processes.js';
import type { CommunitiesOutput } from './communities.js';

const ROOT = 'Method:unity-runtime-root';
const MAX_CALLBACKS = 256;
const TRACES_PER_CALLBACK = 48;
const MAX_BRANCHES = 4;
const MAX_DEPTH = 10;
const MAX_WALKS = 4096;

/** A bounded Unity supplement, independent of the upstream process sampler. */
export const unityProcessesPhase: PipelinePhase = {
  name: 'unity-processes',
  deps: ['processes', 'unity-lifecycle', 'communities'],
  async execute(ctx, deps) {
    const stats = {
      added: 0,
      walks: 0,
      callbacksSeen: 0,
      callbacksTraced: 0,
      callbacksDropped: 0,
      branchesDropped: 0,
      depthCapped: 0,
      candidateCapped: 0,
      walkCapped: 0,
      truncated: false,
    };
    if (!ctx.graph.getNode(ROOT)) return stats;
    const { processResult } = getPhaseOutput<ProcessesOutput>(deps, 'processes');
    const existing = processResult.processes.filter((p) => p.entryPointId === ROOT);
    const adjacency = new Map<string, Set<string>>();
    ctx.graph.forEachRelationshipFields((source, target, type, confidence, reason) => {
      if (type !== 'CALLS' || !(confidence >= 0.5) || isHeuristicEdgeReason(reason)) return;
      if (source === ROOT && reason !== 'unity-lifecycle-synthetic') return;
      if (!ctx.graph.getNode(source) || !ctx.graph.getNode(target)) return;
      let targets = adjacency.get(source);
      if (!targets) adjacency.set(source, (targets = new Set()));
      targets.add(target);
    });
    // Order by semantic identity, not the version-dependent symbol ID format.
    // IDs only break ties between otherwise indistinguishable overloads.
    const orderKey = (id: string) => {
      const node = ctx.graph.getNode(id)!;
      return JSON.stringify([node.properties.filePath, node.properties.name, id]);
    };
    const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    const ordered = new Map(
      [...adjacency].map(([source, targets]) => [
        source,
        [...targets].sort((a, b) => compare(orderKey(a), orderKey(b))),
      ]),
    );
    const callbacks = ordered.get(ROOT) ?? [];
    stats.callbacksSeen = callbacks.length;
    stats.callbacksDropped = Math.max(0, callbacks.length - MAX_CALLBACKS);
    const candidates: string[][] = [];
    for (const callback of callbacks.slice(0, MAX_CALLBACKS)) {
      stats.callbacksTraced++;
      const queue: string[][] = [[ROOT, callback]];
      let cursor = 0;
      let collected = 0;
      while (cursor < queue.length && collected < TRACES_PER_CALLBACK) {
        const trace = queue[cursor++];
        stats.walks++;
        const targets = ordered.get(trace[trace.length - 1]) ?? [];
        if (trace.length >= MAX_DEPTH || !targets.length) {
          if (targets.length) stats.depthCapped++;
          if (trace.length >= 3) {
            candidates.push(trace);
            collected++;
          }
          continue;
        }
        stats.branchesDropped += Math.max(0, targets.length - MAX_BRANCHES);
        const next = targets.slice(0, MAX_BRANCHES).filter((id) => !trace.includes(id));
        if (!next.length && trace.length >= 3) {
          candidates.push(trace);
          collected++;
        }
        for (const id of next) {
          if (queue.length >= MAX_WALKS) {
            stats.walkCapped++;
            break;
          }
          queue.push([...trace, id]);
        }
      }
      if (cursor < queue.length) stats.candidateCapped++;
    }
    // Different ordered paths to the same endpoint are distinct evidence.
    // Generic traces are preserved and suppress only an identical full trace.
    const key = (trace: string[]) => JSON.stringify(trace);
    const seen = new Set(existing.map((p) => key(p.trace)));
    const membership = new Map(
      getPhaseOutput<CommunitiesOutput>(deps, 'communities').communityResult.memberships.map(
        (m) => [m.nodeId, m.communityId],
      ),
    );
    for (const trace of candidates) {
      if (seen.has(key(trace))) continue;
      seen.add(key(trace));
      const id = `proc_unity_${createHash('sha256').update(JSON.stringify(trace)).digest('hex').slice(0, 20)}`;
      const terminalId = trace[trace.length - 1];
      const label = `Unity lifecycle → ${ctx.graph.getNode(terminalId)?.properties.name ?? terminalId}`;
      const communities = [
        ...new Set(trace.flatMap((n) => (membership.has(n) ? [membership.get(n)!] : []))),
      ];
      const proc = {
        id,
        label,
        heuristicLabel: label,
        processType:
          communities.length > 1 ? ('cross_community' as const) : ('intra_community' as const),
        stepCount: trace.length,
        communities,
        entryPointId: ROOT,
        terminalId,
        trace,
      };
      processResult.processes.push(proc);
      ctx.graph.addNode({
        id,
        label: 'Process',
        properties: {
          name: label,
          filePath: '',
          heuristicLabel: label,
          processType: proc.processType,
          stepCount: trace.length,
          communities,
          entryPointId: ROOT,
          terminalId,
        },
      });
      trace.forEach((nodeId, i) => {
        processResult.steps.push({ nodeId, processId: id, step: i + 1 });
        ctx.graph.addRelationship({
          id: `${nodeId}_step_${i + 1}_${id}`,
          type: 'STEP_IN_PROCESS',
          sourceId: nodeId,
          targetId: id,
          step: i + 1,
          confidence: 1,
          reason: 'trace-detection',
        });
      });
      stats.added++;
    }
    stats.truncated =
      stats.callbacksDropped > 0 ||
      stats.branchesDropped > 0 ||
      stats.depthCapped > 0 ||
      stats.candidateCapped > 0 ||
      stats.walkCapped > 0;
    processResult.stats.totalProcesses = processResult.processes.length;
    processResult.stats.crossCommunityCount = processResult.processes.filter(
      (p) => p.processType === 'cross_community',
    ).length;
    processResult.stats.avgStepCount =
      processResult.processes.reduce((sum, p) => sum + p.stepCount, 0) /
        processResult.processes.length || 0;
    logger.info({ unityProcesses: stats }, '[unity-processes] bounded lifecycle supplement');
    return stats;
  },
};
