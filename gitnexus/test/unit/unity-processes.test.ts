import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GraphEmitSink } from '../../src/core/lbug/graph-emit-sink.js';
import { createKnowledgeGraph } from '../../src/core/graph/graph.js';
import { processProcesses } from '../../src/core/ingestion/process-processor.js';
import { unityProcessesPhase } from '../../src/core/ingestion/pipeline-phases/unity-processes.js';
import { unityProcessSubtypePhase } from '../../src/core/ingestion/pipeline-phases/unity-process-subtype.js';

const ROOT = 'Method:unity-runtime-root';
const makeGraph = (reverse = false) => {
  const graph = createKnowledgeGraph();
  const names = [
    ROOT,
    ...Array.from({ length: 16 }, (_, i) => [
      `Method:Assets/Game.cs:Awake${i}`,
      `Method:Assets/Game.cs:Run${i}`,
    ]).flat(),
  ];
  for (const id of names)
    graph.addNode({
      id,
      label: 'Method',
      properties: { name: id.split(':').at(-1)!, filePath: 'Assets/Game.cs' },
    });
  for (const i of Array.from({ length: 16 }, (_, i) => i).sort((a, b) =>
    reverse ? b - a : a - b,
  )) {
    const callback = `Method:Assets/Game.cs:Awake${i}`,
      end = `Method:Assets/Game.cs:Run${i}`;
    graph.addRelationship({
      id: `root${i}`,
      sourceId: ROOT,
      targetId: callback,
      type: 'CALLS',
      confidence: 0.68,
      reason: 'unity-lifecycle-synthetic',
    });
    graph.addRelationship({
      id: `call${i}`,
      sourceId: callback,
      targetId: end,
      type: 'CALLS',
      confidence: i === 15 ? 0.3 : 1,
      reason: i === 14 ? 'global-name-fallback' : 'local-call',
    });
  }
  return graph;
};
const depsFor = (result: any) =>
  new Map([
    ['processes', { output: { processResult: result } }],
    ['communities', { output: { communityResult: { memberships: [] } } }],
    ['unity-lifecycle', { output: { enabled: true } }],
  ]) as any;

describe('dedicated Unity process budget', () => {
  it('restores eight real traces beyond the generic four-branch root budget and is idempotent', async () => {
    const graph = makeGraph();
    const result = await processProcesses(graph, [], undefined, { maxProcesses: 100 });
    expect(result.processes.filter((p) => p.entryPointId === ROOT).length).toBeLessThan(8);
    const ctx = { graph } as any,
      deps = depsFor(result);
    const stats = (await unityProcessesPhase.execute(ctx, deps)) as any;
    expect(stats.added).toBeGreaterThan(0);
    const traces = result.processes.filter((p) => p.entryPointId === ROOT);
    expect(traces).toHaveLength(8);
    expect(
      traces.every((p) => !p.trace.some((id) => id.endsWith('Run15') || id.endsWith('Run14'))),
    ).toBe(true);
    await unityProcessSubtypePhase.execute(ctx, deps);
    for (const p of traces.filter((p) => p.id.startsWith('proc_unity_'))) {
      expect(graph.getNode(p.id)?.properties.processSubtype).toBe('unity_lifecycle');
      expect(
        [...graph.iterRelationshipsByType('STEP_IN_PROCESS')].filter((e) => e.targetId === p.id),
      ).toHaveLength(3);
    }
    expect(((await unityProcessesPhase.execute(ctx, deps)) as any).added).toBe(0);
    expect(result.stats.totalProcesses).toBe(result.processes.length);
  });
  it('is deterministic for the same input independent of relationship insertion order', async () => {
    const ids = [];
    for (const reverse of [false, true]) {
      const graph = makeGraph(reverse);
      const result = { processes: [], steps: [], stats: {} };
      await unityProcessesPhase.execute({ graph } as any, depsFor(result));
      ids.push(result.processes.map((p: any) => p.id));
    }
    expect(ids[0]).toEqual(ids[1]);
    expect(ids[0]).toHaveLength(8);
  });
  it('does nothing without the actual synthetic root', async () => {
    const graph = createKnowledgeGraph();
    const result = { processes: [], steps: [], stats: {} };
    expect(
      ((await unityProcessesPhase.execute({ graph } as any, depsFor(result))) as any).added,
    ).toBe(0);
    expect(graph.nodeCount).toBe(0);
  });
  it('preserves the supplement and edge evidence when CALLS are streamed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unity-process-stream-'));
    const source = makeGraph();
    const sink = new GraphEmitSink(createKnowledgeGraph(), dir);
    try {
      for (const node of source.iterNodes()) sink.addNode(node);
      sink.beginStreaming();
      for (const edge of source.iterRelationships()) sink.addRelationship(edge);
      const result = { processes: [], steps: [], stats: {} };
      const deps = depsFor(result);
      await unityProcessesPhase.execute({ graph: sink } as any, deps);
      await unityProcessSubtypePhase.execute({ graph: sink } as any, deps);
      expect(result.processes).toHaveLength(8);
      for (const proc of result.processes as any[]) {
        expect(sink.getNode(proc.id)?.properties.sourceReasons).toContain(
          'unity-lifecycle-synthetic',
        );
      }
    } finally {
      sink.finalize();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
