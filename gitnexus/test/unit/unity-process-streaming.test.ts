import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKnowledgeGraph } from '../../src/core/graph/graph.js';
import { GraphEmitSink } from '../../src/core/lbug/graph-emit-sink.js';
import { unityProcessSubtypePhase } from '../../src/core/ingestion/pipeline-phases/unity-process-subtype.js';

describe('Unity subtype with structural streaming', () => {
  it('uses actual CALLS reasons and replaces persisted step evidence', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-unity-stream-'));
    const graph = new GraphEmitSink(createKnowledgeGraph(), path.join(root, 'csv'));
    try {
      for (const name of ['root', 'Awake', 'Run'])
        graph.addNode({
          id: `Method:Assets/Game.cs:${name}`,
          label: 'Method',
          properties: { name, filePath: 'Assets/Game.cs' },
        });
      graph.addNode({
        id: 'Process:lifecycle',
        label: 'Process',
        properties: { name: 'lifecycle', filePath: '' },
      });
      graph.beginStreaming();
      graph.addRelationship({
        id: 'a',
        sourceId: 'Method:Assets/Game.cs:root',
        targetId: 'Method:Assets/Game.cs:Awake',
        type: 'CALLS',
        confidence: 0.68,
        reason: 'unity-lifecycle-synthetic',
      });
      graph.addRelationship({
        id: 'b',
        sourceId: 'Method:Assets/Game.cs:Awake',
        targetId: 'Method:Assets/Game.cs:Run',
        type: 'CALLS',
        confidence: 1,
        reason: 'local-call',
      });
      const proc = {
        id: 'Process:lifecycle',
        trace: ['root', 'Awake', 'Run'].map((name) => `Method:Assets/Game.cs:${name}`),
      };
      for (const [i, sourceId] of proc.trace.entries())
        graph.addRelationship({
          id: `${sourceId}_step_${i + 1}_${proc.id}`,
          sourceId,
          targetId: proc.id,
          type: 'STEP_IN_PROCESS',
          step: i + 1,
          confidence: 1,
          reason: 'process-member',
        });
      await unityProcessSubtypePhase.execute(
        { graph } as any,
        new Map([
          ['unity-lifecycle', { output: { enabled: true } }],
          ['processes', { output: { processResult: { processes: [proc] } } }],
        ]) as any,
      );
      expect(graph.getNode('Process:lifecycle')?.properties).toMatchObject({
        processSubtype: 'unity_lifecycle',
        runtimeChainConfidence: 'medium',
        sourceReasons: ['unity-lifecycle-synthetic', 'local-call'],
      });
      expect([...graph.iterRelationshipsByType('STEP_IN_PROCESS')].map((e) => e.reason)).toEqual([
        'unity-lifecycle-synthetic',
        'unity-lifecycle-synthetic',
        'local-call',
      ]);
    } finally {
      await graph.finalize();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
