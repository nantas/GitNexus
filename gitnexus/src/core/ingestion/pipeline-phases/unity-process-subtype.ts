import type { GraphRelationship } from 'gitnexus-shared';
import type { PipelinePhase } from './types.js';
import { getPhaseOutput } from './types.js';
import type { ProcessesOutput } from './processes.js';

export const unityProcessSubtypePhase: PipelinePhase = {
  name: 'unity-process-subtype',
  deps: ['processes', 'unity-lifecycle', 'unity-processes'],
  async execute(ctx, deps) {
    const calls = new Map<string, GraphRelationship>();
    // Streamed object views intentionally omit reasons. Read the interned
    // field columns so cold and cached/streamed runs classify identically.
    ctx.graph.forEachRelationshipFields((sourceId, targetId, type, confidence, reason) => {
      if (type !== 'CALLS') return;
      const key = JSON.stringify([sourceId, targetId]);
      const previous = calls.get(key);
      if (!previous || confidence > previous.confidence) {
        calls.set(key, { id: key, sourceId, targetId, type, confidence, reason });
      }
    });
    const { processResult } = getPhaseOutput<ProcessesOutput>(deps, 'processes');
    for (const proc of processResult.processes) {
      const evidence = proc.trace
        .slice(1)
        .map((target, i) => calls.get(JSON.stringify([proc.trace[i], target])));
      const sourceReasons = [
        ...new Set(
          evidence.flatMap((e) =>
            e?.reason && !/TODO|TBD|placeholder/i.test(e.reason) ? [e.reason] : [],
          ),
        ),
      ];
      const sourceConfidences = [
        ...new Set(
          evidence.flatMap((e) => (e && Number.isFinite(e.confidence) ? [e.confidence] : [])),
        ),
      ];
      const synthetic = sourceReasons.some(
        (r) =>
          r.includes('unity-lifecycle-synthetic') || r.includes('unity-runtime-loader-synthetic'),
      );
      const metadata = {
        processSubtype: synthetic ? 'unity_lifecycle' : 'static_calls',
        runtimeChainConfidence: synthetic ? 'medium' : 'high',
        sourceReasons,
        sourceConfidences,
      };
      Object.assign(proc, metadata);
      const node = ctx.graph.getNode(proc.id);
      if (node) Object.assign(node.properties, metadata);
      for (let i = 0; i < proc.trace.length; i++) {
        const edge = evidence[i === 0 ? 0 : i - 1];
        if (!edge) continue;
        ctx.graph.removeRelationship(`${proc.trace[i]}_step_${i + 1}_${proc.id}`);
        ctx.graph.addRelationship({
          id: `${proc.trace[i]}_step_${i + 1}_${proc.id}`,
          type: 'STEP_IN_PROCESS',
          sourceId: proc.trace[i],
          targetId: proc.id,
          step: i + 1,
          reason: edge.reason,
          confidence: edge.confidence,
        });
      }
    }
  },
};
