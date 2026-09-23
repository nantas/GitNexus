import { logger } from '../../logger.js';
import { createHash } from 'node:crypto';
import { isHeuristicEdgeReason } from '../../graph/edge-reasons.js';
import type { PipelinePhase } from './types.js';
import { getPhaseOutput } from './types.js';
import type { ProcessesOutput } from './processes.js';
import type { CommunitiesOutput } from './communities.js';

const ROOT = 'Method:unity-runtime-root';
const LIMIT = 8;
const MAX_DEPTH = 10;
const MAX_WALKS = 4096;

/** A bounded Unity supplement, independent of the upstream process sampler. */
export const unityProcessesPhase: PipelinePhase = {
  name: 'unity-processes',
  deps: ['processes', 'unity-lifecycle', 'communities'],
  async execute(ctx, deps) {
    const stats = { added: 0, walks: 0, branchesDropped: 0, depthCapped: 0, truncated: false };
    if (!ctx.graph.getNode(ROOT)) return stats;
    const { processResult } = getPhaseOutput<ProcessesOutput>(deps, 'processes');
    const existing = processResult.processes.filter((p) => p.entryPointId === ROOT);
    if (existing.length >= LIMIT) return stats;
    const adjacency = new Map<string, Set<string>>();
    ctx.graph.forEachRelationshipFields((source, target, type, confidence, reason) => {
      if (type !== 'CALLS' || confidence < 0.5 || isHeuristicEdgeReason(reason)) return;
      if (source === ROOT && reason !== 'unity-lifecycle-synthetic') return;
      if (!ctx.graph.getNode(source) || !ctx.graph.getNode(target)) return;
      let targets = adjacency.get(source);
      if (!targets) adjacency.set(source, (targets = new Set()));
      targets.add(target);
    });
    const queue: string[][] = [[ROOT]];
    const candidates: string[][] = [];
    let cursor = 0;
    while (cursor < queue.length && stats.walks < MAX_WALKS) {
      const trace = queue[cursor++];
      stats.walks++;
      const targets = [...(adjacency.get(trace[trace.length - 1]) ?? [])].sort();
      if (trace.length >= MAX_DEPTH || !targets.length) {
        if (targets.length) stats.depthCapped++;
        if (trace.length >= 3) candidates.push(trace);
        continue;
      }
      // The synthetic root has many independent callbacks; ordinary methods
      // retain the upstream branching budget. Bound the queue as well as visits.
      const budget = trace.length === 1 ? 32 : 4;
      stats.branchesDropped += Math.max(0, targets.length - budget);
      const next = targets.slice(0, budget).filter((id) => !trace.includes(id));
      if (!next.length && trace.length >= 3) candidates.push(trace);
      for (const id of next) {
        if (queue.length >= MAX_WALKS) {
          stats.truncated = true;
          break;
        }
        queue.push([...trace, id]);
      }
    }
    const key = (trace: string[]) => JSON.stringify([trace[1], trace[trace.length - 1]]);
    const seen = new Set(existing.map((p) => key(p.trace)));
    // Prefer distinct callbacks, then longer traces, with a total-order tie break.
    const usedCallbacks = new Set(existing.map((p) => p.trace[1]));
    candidates.sort(
      (a, b) => b.length - a.length || JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
    const membership = new Map(
      getPhaseOutput<CommunitiesOutput>(deps, 'communities').communityResult.memberships.map(
        (m) => [m.nodeId, m.communityId],
      ),
    );
    while (existing.length + stats.added < LIMIT && candidates.length) {
      const diverse = candidates.findIndex((t) => !usedCallbacks.has(t[1]) && !seen.has(key(t)));
      const trace = candidates.splice(diverse < 0 ? 0 : diverse, 1)[0];
      if (seen.has(key(trace))) continue;
      seen.add(key(trace));
      usedCallbacks.add(trace[1]);
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
    stats.truncated ||=
      stats.branchesDropped > 0 ||
      stats.depthCapped > 0 ||
      candidates.length > 0 ||
      cursor < queue.length;
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
