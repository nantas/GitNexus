import { describe, it, expect, vi } from 'vitest';
import { unityProcessSubtypePhase } from '../../src/core/ingestion/pipeline-phases/unity-process-subtype.js';
import {
  processProcesses,
  type ProcessDetectionConfig,
} from '../../src/core/ingestion/process-processor.js';
import { createKnowledgeGraph } from '../../src/core/graph/graph.js';
import type { CommunityMembership } from '../../src/core/ingestion/community-processor.js';

describe('processProcesses', () => {
  it('detects no processes in empty graph', async () => {
    const graph = createKnowledgeGraph();
    const result = await processProcesses(graph, []);
    expect(result.processes).toHaveLength(0);
    expect(result.steps).toHaveLength(0);
    expect(result.stats.totalProcesses).toBe(0);
    expect(result.stats.entryPointsFound).toBe(0);
    expect(result.stats.avgStepCount).toBe(0);
  });

  it('detects no processes when there are no CALLS relationships', async () => {
    const graph = createKnowledgeGraph();
    graph.addNode({
      id: 'func:main',
      label: 'Function',
      properties: {
        name: 'main',
        filePath: 'src/index.ts',
        startLine: 1,
        endLine: 10,
        isExported: true,
      },
    });

    const result = await processProcesses(graph, []);
    expect(result.processes).toHaveLength(0);
  });

  it('detects a simple 3-step process with correct structure', async () => {
    const graph = createKnowledgeGraph();

    // Create 3 functions in a chain
    graph.addNode({
      id: 'func:handleRequest',
      label: 'Function',
      properties: {
        name: 'handleRequest',
        filePath: 'src/handler.ts',
        startLine: 1,
        endLine: 10,
        isExported: true,
      },
    });
    graph.addNode({
      id: 'func:validateInput',
      label: 'Function',
      properties: {
        name: 'validateInput',
        filePath: 'src/validator.ts',
        startLine: 1,
        endLine: 5,
        isExported: true,
      },
    });
    graph.addNode({
      id: 'func:saveToDb',
      label: 'Function',
      properties: {
        name: 'saveToDb',
        filePath: 'src/db.ts',
        startLine: 1,
        endLine: 8,
        isExported: true,
      },
    });

    // handleRequest -> validateInput -> saveToDb
    graph.addRelationship({
      id: 'call:1',
      sourceId: 'func:handleRequest',
      targetId: 'func:validateInput',
      type: 'CALLS',
      confidence: 0.9,
      reason: 'import-resolved',
    });
    graph.addRelationship({
      id: 'call:2',
      sourceId: 'func:validateInput',
      targetId: 'func:saveToDb',
      type: 'CALLS',
      confidence: 0.9,
      reason: 'import-resolved',
    });

    const memberships: CommunityMembership[] = [
      { nodeId: 'func:handleRequest', communityId: 'community:0' },
      { nodeId: 'func:validateInput', communityId: 'community:0' },
      { nodeId: 'func:saveToDb', communityId: 'community:0' },
    ];

    const result = await processProcesses(graph, memberships);

    // Must detect at least one process
    expect(result.processes.length).toBeGreaterThan(0);

    // Find the process starting from handleRequest
    const process = result.processes.find((p) => p.entryPointId === 'func:handleRequest');
    expect(process).toBeDefined();
    expect(process!.stepCount).toBe(3);
    expect(process!.entryPointId).toBe('func:handleRequest');
    expect(process!.terminalId).toBe('func:saveToDb');
    expect(process!.processType).toBe('intra_community');
    expect(process!.communities).toEqual(['community:0']);

    // Verify trace order: entry -> middle -> terminal
    expect(process!.trace).toEqual(['func:handleRequest', 'func:validateInput', 'func:saveToDb']);

    // Verify steps are 1-indexed and in correct order
    const processSteps = result.steps.filter((s) => s.processId === process!.id);
    expect(processSteps).toHaveLength(3);
    expect(processSteps[0]).toEqual(
      expect.objectContaining({ nodeId: 'func:handleRequest', step: 1 }),
    );
    expect(processSteps[1]).toEqual(
      expect.objectContaining({ nodeId: 'func:validateInput', step: 2 }),
    );
    expect(processSteps[2]).toEqual(expect.objectContaining({ nodeId: 'func:saveToDb', step: 3 }));

    // Verify label is generated from entry and terminal names
    expect(process!.heuristicLabel).toContain('HandleRequest');
    expect(process!.heuristicLabel).toContain('SaveToDb');

    // Stats should reflect the detected processes
    expect(result.stats.totalProcesses).toBe(result.processes.length);
    expect(result.stats.entryPointsFound).toBeGreaterThan(0);
  });

  it('respects maxTraceDepth config', async () => {
    const graph = createKnowledgeGraph();

    // Create a long chain: f0 -> f1 -> f2 -> f3 -> f4
    for (let i = 0; i < 5; i++) {
      graph.addNode({
        id: `func:f${i}`,
        label: 'Function',
        properties: {
          name: `f${i}`,
          filePath: `src/f${i}.ts`,
          startLine: 1,
          endLine: 5,
          isExported: true,
        },
      });
    }
    for (let i = 0; i < 4; i++) {
      graph.addRelationship({
        id: `call:${i}`,
        sourceId: `func:f${i}`,
        targetId: `func:f${i + 1}`,
        type: 'CALLS',
        confidence: 0.9,
        reason: '',
      });
    }

    const memberships: CommunityMembership[] = Array.from({ length: 5 }, (_, i) => ({
      nodeId: `func:f${i}`,
      communityId: 'community:0',
    }));

    // Limit to 3 steps max depth
    const config: Partial<ProcessDetectionConfig> = { maxTraceDepth: 3 };
    const result = await processProcesses(graph, memberships, undefined, config);

    // Should still find processes, but each trace should be at most maxTraceDepth steps
    expect(result.processes.length).toBeGreaterThan(0);
    for (const process of result.processes) {
      expect(process.stepCount).toBeLessThanOrEqual(3);
    }
  });

  it('detects cross_community processes', async () => {
    const graph = createKnowledgeGraph();

    graph.addNode({
      id: 'func:apiHandler',
      label: 'Function',
      properties: {
        name: 'apiHandler',
        filePath: 'src/api/handler.ts',
        startLine: 1,
        endLine: 10,
        isExported: true,
      },
    });
    graph.addNode({
      id: 'func:dbQuery',
      label: 'Function',
      properties: {
        name: 'dbQuery',
        filePath: 'src/db/query.ts',
        startLine: 1,
        endLine: 5,
        isExported: true,
      },
    });
    graph.addNode({
      id: 'func:formatResponse',
      label: 'Function',
      properties: {
        name: 'formatResponse',
        filePath: 'src/api/format.ts',
        startLine: 1,
        endLine: 5,
        isExported: true,
      },
    });

    // apiHandler -> dbQuery (cross community), apiHandler -> formatResponse (same community)
    graph.addRelationship({
      id: 'call:1',
      sourceId: 'func:apiHandler',
      targetId: 'func:dbQuery',
      type: 'CALLS',
      confidence: 0.9,
      reason: '',
    });
    graph.addRelationship({
      id: 'call:2',
      sourceId: 'func:dbQuery',
      targetId: 'func:formatResponse',
      type: 'CALLS',
      confidence: 0.9,
      reason: '',
    });

    // Put them in different communities
    const memberships: CommunityMembership[] = [
      { nodeId: 'func:apiHandler', communityId: 'community:api' },
      { nodeId: 'func:dbQuery', communityId: 'community:db' },
      { nodeId: 'func:formatResponse', communityId: 'community:api' },
    ];

    const result = await processProcesses(graph, memberships);

    // Must find at least one process
    expect(result.processes.length).toBeGreaterThan(0);

    // The process from apiHandler should be cross_community (touches api + db communities)
    const crossProcess = result.processes.find((p) => p.entryPointId === 'func:apiHandler');
    expect(crossProcess).toBeDefined();
    expect(crossProcess!.processType).toBe('cross_community');
    expect(crossProcess!.communities.length).toBeGreaterThan(1);
    expect(crossProcess!.communities).toContain('community:api');
    expect(crossProcess!.communities).toContain('community:db');

    // Stats should count cross-community
    expect(result.stats.crossCommunityCount).toBeGreaterThan(0);
  });

  it('excludes test files from entry points', async () => {
    const graph = createKnowledgeGraph();

    // Test file function
    graph.addNode({
      id: 'func:testMain',
      label: 'Function',
      properties: {
        name: 'testMain',
        filePath: 'test/unit/main.test.ts',
        startLine: 1,
        endLine: 10,
        isExported: true,
      },
    });
    graph.addNode({
      id: 'func:helper',
      label: 'Function',
      properties: {
        name: 'helper',
        filePath: 'src/helper.ts',
        startLine: 1,
        endLine: 5,
        isExported: true,
      },
    });

    graph.addRelationship({
      id: 'call:1',
      sourceId: 'func:testMain',
      targetId: 'func:helper',
      type: 'CALLS',
      confidence: 0.9,
      reason: '',
    });

    const result = await processProcesses(graph, []);

    // Test files should not be used as entry points
    const testProcess = result.processes.find((p) => p.entryPointId === 'func:testMain');
    expect(testProcess).toBeUndefined();
  });

  it('filters out low-confidence calls (below 0.5)', async () => {
    const graph = createKnowledgeGraph();

    graph.addNode({
      id: 'func:a',
      label: 'Function',
      properties: { name: 'a', filePath: 'src/a.ts', startLine: 1, endLine: 5, isExported: true },
    });
    graph.addNode({
      id: 'func:b',
      label: 'Function',
      properties: { name: 'b', filePath: 'src/b.ts', startLine: 1, endLine: 5, isExported: true },
    });
    graph.addNode({
      id: 'func:c',
      label: 'Function',
      properties: { name: 'c', filePath: 'src/c.ts', startLine: 1, endLine: 5, isExported: true },
    });

    // a -> b with low confidence (fuzzy-global ambiguous), a -> c with high confidence
    graph.addRelationship({
      id: 'call:1',
      sourceId: 'func:a',
      targetId: 'func:b',
      type: 'CALLS',
      confidence: 0.3,
      reason: 'fuzzy-global',
    });
    graph.addRelationship({
      id: 'call:2',
      sourceId: 'func:a',
      targetId: 'func:c',
      type: 'CALLS',
      confidence: 0.9,
      reason: 'import-resolved',
    });

    const result = await processProcesses(graph, []);

    // No process should include func:b since the edge has confidence < 0.5 (MIN_TRACE_CONFIDENCE)
    for (const process of result.processes) {
      expect(process.trace).not.toContain('func:b');
    }
  });

  it('handles cycles without infinite loops', async () => {
    const graph = createKnowledgeGraph();

    graph.addNode({
      id: 'func:a',
      label: 'Function',
      properties: {
        name: 'processItem',
        filePath: 'src/a.ts',
        startLine: 1,
        endLine: 5,
        isExported: true,
      },
    });
    graph.addNode({
      id: 'func:b',
      label: 'Function',
      properties: {
        name: 'validate',
        filePath: 'src/b.ts',
        startLine: 1,
        endLine: 5,
        isExported: true,
      },
    });
    graph.addNode({
      id: 'func:c',
      label: 'Function',
      properties: {
        name: 'retry',
        filePath: 'src/c.ts',
        startLine: 1,
        endLine: 5,
        isExported: true,
      },
    });

    // a -> b -> c -> a (cycle)
    graph.addRelationship({
      id: 'call:1',
      sourceId: 'func:a',
      targetId: 'func:b',
      type: 'CALLS',
      confidence: 0.9,
      reason: '',
    });
    graph.addRelationship({
      id: 'call:2',
      sourceId: 'func:b',
      targetId: 'func:c',
      type: 'CALLS',
      confidence: 0.9,
      reason: '',
    });
    graph.addRelationship({
      id: 'call:3',
      sourceId: 'func:c',
      targetId: 'func:a',
      type: 'CALLS',
      confidence: 0.9,
      reason: '',
    });

    const memberships: CommunityMembership[] = [
      { nodeId: 'func:a', communityId: 'community:0' },
      { nodeId: 'func:b', communityId: 'community:0' },
      { nodeId: 'func:c', communityId: 'community:0' },
    ];

    // Should complete without hanging, and traces should not repeat nodes
    const result = await processProcesses(graph, memberships);
    for (const process of result.processes) {
      const uniqueNodes = new Set(process.trace);
      expect(uniqueNodes.size).toBe(process.trace.length);
    }
  });

  it('respects minSteps default (3) — rejects 2-step traces', async () => {
    const graph = createKnowledgeGraph();

    // Only 2 functions: a -> b (2 steps, below default minSteps of 3)
    graph.addNode({
      id: 'func:caller',
      label: 'Function',
      properties: {
        name: 'caller',
        filePath: 'src/caller.ts',
        startLine: 1,
        endLine: 5,
        isExported: true,
      },
    });
    graph.addNode({
      id: 'func:callee',
      label: 'Function',
      properties: {
        name: 'callee',
        filePath: 'src/callee.ts',
        startLine: 1,
        endLine: 5,
        isExported: true,
      },
    });

    graph.addRelationship({
      id: 'call:1',
      sourceId: 'func:caller',
      targetId: 'func:callee',
      type: 'CALLS',
      confidence: 0.9,
      reason: '',
    });

    const result = await processProcesses(graph, []);

    // Default minSteps is 3, so a 2-step trace (caller -> callee) should be rejected
    expect(result.processes).toHaveLength(0);
  });

  it('calls progress callback with messages', async () => {
    const graph = createKnowledgeGraph();
    const onProgress = vi.fn();

    await processProcesses(graph, [], onProgress);

    expect(onProgress).toHaveBeenCalled();
    // Verify callback receives (message: string, progress: number)
    const [message, progress] = onProgress.mock.calls[0];
    expect(typeof message).toBe('string');
    expect(typeof progress).toBe('number');
    expect(progress).toBeGreaterThanOrEqual(0);
    expect(progress).toBeLessThanOrEqual(100);
  });

  it('traces through synthetic Unity runtime roots', async () => {
    const graph = createKnowledgeGraph();
    const nodes = [
      { id: 'method:unity-runtime-root', name: 'unity-runtime-root' },
      { id: 'method:Awake', name: 'Awake' },
      { id: 'method:OnEnable', name: 'OnEnable' },
      { id: 'method:RegisterEvents', name: 'RegisterEvents' },
      { id: 'method:StartRoutineWithEvents', name: 'StartRoutineWithEvents' },
      { id: 'method:Noise', name: 'Noise' },
    ];

    for (const node of nodes) {
      graph.addNode({
        id: node.id,
        label: 'Method',
        properties: {
          name: node.name,
          filePath: 'Assets/Scripts/GunGraphMB.cs',
          isExported: false,
        },
      });
    }

    graph.addRelationship({
      id: 'call:runtime-awake',
      sourceId: 'method:unity-runtime-root',
      targetId: 'method:Awake',
      type: 'CALLS',
      confidence: 0.68,
      reason: 'unity-lifecycle-synthetic',
    });
    graph.addRelationship({
      id: 'call:runtime-onenable',
      sourceId: 'method:unity-runtime-root',
      targetId: 'method:OnEnable',
      type: 'CALLS',
      confidence: 0.68,
      reason: 'unity-lifecycle-synthetic',
    });
    graph.addRelationship({
      id: 'call:awake-register',
      sourceId: 'method:Awake',
      targetId: 'method:RegisterEvents',
      type: 'CALLS',
      confidence: 0.68,
      reason: 'unity-runtime-loader-synthetic',
    });
    graph.addRelationship({
      id: 'call:onenable-register',
      sourceId: 'method:OnEnable',
      targetId: 'method:RegisterEvents',
      type: 'CALLS',
      confidence: 0.68,
      reason: 'unity-runtime-loader-synthetic',
    });
    graph.addRelationship({
      id: 'call:register-start',
      sourceId: 'method:RegisterEvents',
      targetId: 'method:StartRoutineWithEvents',
      type: 'CALLS',
      confidence: 0.68,
      reason: 'unity-runtime-loader-synthetic',
    });
    graph.addRelationship({
      id: 'call:register-noise-low-confidence',
      sourceId: 'method:RegisterEvents',
      targetId: 'method:Noise',
      type: 'CALLS',
      confidence: 0.3,
      reason: 'fuzzy-global',
    });

    const memberships: CommunityMembership[] = nodes.map((node) => ({
      nodeId: node.id,
      communityId: 'community:unity',
    }));

    const result = await processProcesses(graph, memberships);
    const runtimeRootProcesses = result.processes.filter((processNode) =>
      processNode.entryPointId.includes('unity-runtime-root'),
    );

    expect(
      result.processes.some((processNode) =>
        processNode.trace.some((id) => id.includes('unity-runtime-root')),
      ),
    ).toBe(true);
    expect(result.processes.some((processNode) => processNode.stepCount >= 3)).toBe(true);
    expect(runtimeRootProcesses.length).toBeGreaterThanOrEqual(1);
    expect(
      runtimeRootProcesses.some((processNode) =>
        processNode.trace.includes('method:RegisterEvents'),
      ),
    ).toBe(true);
    expect(
      runtimeRootProcesses.some((processNode) =>
        processNode.trace.includes('method:StartRoutineWithEvents'),
      ),
    ).toBe(true);
    expect(
      result.processes.every((processNode) => !processNode.trace.includes('method:Noise')),
    ).toBe(true);
  });

  it('classifies persisted unity lifecycle process subtype', async () => {
    const graph = createKnowledgeGraph();
    const nodes = [
      {
        id: 'method:unity-runtime-root',
        label: 'Method',
        name: 'unity-runtime-root',
        filePath: 'Assets/Scripts/RuntimeRoot.cs',
        isExported: false,
      },
      {
        id: 'method:Awake',
        label: 'Method',
        name: 'Awake',
        filePath: 'Assets/Scripts/GunGraphMB.cs',
        isExported: false,
      },
      {
        id: 'method:RegisterEvents',
        label: 'Method',
        name: 'RegisterEvents',
        filePath: 'Assets/Scripts/GunGraph.cs',
        isExported: false,
      },
      {
        id: 'method:StartRoutineWithEvents',
        label: 'Method',
        name: 'StartRoutineWithEvents',
        filePath: 'Assets/Scripts/GunGraph.cs',
        isExported: false,
      },
      {
        id: 'func:handleRequest',
        label: 'Function',
        name: 'handleRequest',
        filePath: 'src/handler.ts',
        isExported: true,
      },
      {
        id: 'func:validateInput',
        label: 'Function',
        name: 'validateInput',
        filePath: 'src/validator.ts',
        isExported: true,
      },
      {
        id: 'func:saveToDb',
        label: 'Function',
        name: 'saveToDb',
        filePath: 'src/db.ts',
        isExported: true,
      },
    ] as const;

    for (const node of nodes) {
      graph.addNode({
        id: node.id,
        label: node.label,
        properties: {
          name: node.name,
          filePath: node.filePath,
          isExported: node.isExported,
        },
      });
    }

    const addCall = (
      id: string,
      sourceId: string,
      targetId: string,
      confidence: number,
      reason: string,
    ) => {
      graph.addRelationship({
        id,
        sourceId,
        targetId,
        type: 'CALLS',
        confidence,
        reason,
      });
    };

    addCall(
      'call:runtime-awake',
      'method:unity-runtime-root',
      'method:Awake',
      0.68,
      'unity-lifecycle-synthetic',
    );
    addCall(
      'call:awake-register',
      'method:Awake',
      'method:RegisterEvents',
      0.68,
      'unity-runtime-loader-synthetic',
    );
    addCall(
      'call:register-start',
      'method:RegisterEvents',
      'method:StartRoutineWithEvents',
      0.68,
      'unity-runtime-loader-synthetic',
    );
    addCall(
      'call:handle-validate',
      'func:handleRequest',
      'func:validateInput',
      0.95,
      'import-resolved',
    );
    addCall('call:validate-save', 'func:validateInput', 'func:saveToDb', 0.95, 'same-file');

    const memberships: CommunityMembership[] = nodes.map((node) => ({
      nodeId: node.id,
      communityId: 'community:test',
    }));

    const result = await processProcesses(graph, memberships);
    await unityProcessSubtypePhase.execute(
      { graph } as any,
      new Map([
        ['unity-lifecycle', { output: { enabled: true } }],
        ['processes', { output: { processResult: result } }],
      ]) as any,
    );
    const runtimeProc = result.processes.find(
      (processNode) => processNode.entryPointId === 'method:unity-runtime-root',
    );
    const staticProc = result.processes.find(
      (processNode) => processNode.entryPointId === 'func:handleRequest',
    );

    expect(runtimeProc).toBeDefined();
    expect(staticProc).toBeDefined();
    expect(runtimeProc!.processSubtype).toBe('unity_lifecycle');
    expect(staticProc!.processSubtype).toBe('static_calls');
    expect(runtimeProc!.runtimeChainConfidence).toBe('medium');
    expect(staticProc!.runtimeChainConfidence).toBe('high');
    expect(runtimeProc!.sourceReasons).toContain('unity-runtime-loader-synthetic');
    expect(runtimeProc!.sourceConfidences.length).toBeGreaterThan(0);

    const runtimeSteps = [...graph.iterRelationshipsByType('STEP_IN_PROCESS')].filter(
      (step) => step.targetId === runtimeProc!.id,
    );
    expect(runtimeSteps.some((step) => step.reason === 'unity-runtime-loader-synthetic')).toBe(
      true,
    );
    expect(runtimeSteps.every((step) => step.confidence !== undefined)).toBe(true);
    expect(
      runtimeSteps.every(
        (step) => !/TODO|TBD|placeholder/i.test(`${step.sourceId} ${step.reason ?? ''}`),
      ),
    ).toBe(true);
  });

  it('limits output to maxProcesses', async () => {
    const graph = createKnowledgeGraph();

    // Create many independent 3-step chains to generate many processes
    for (let chain = 0; chain < 10; chain++) {
      for (let step = 0; step < 3; step++) {
        graph.addNode({
          id: `func:chain${chain}_f${step}`,
          label: 'Function',
          properties: {
            name: `chain${chain}_f${step}`,
            filePath: `src/chain${chain}/f${step}.ts`,
            startLine: 1,
            endLine: 5,
            isExported: true,
          },
        });
      }
      for (let step = 0; step < 2; step++) {
        graph.addRelationship({
          id: `call:chain${chain}_${step}`,
          sourceId: `func:chain${chain}_f${step}`,
          targetId: `func:chain${chain}_f${step + 1}`,
          type: 'CALLS',
          confidence: 0.9,
          reason: '',
        });
      }
    }

    const memberships: CommunityMembership[] = [];
    for (let chain = 0; chain < 10; chain++) {
      for (let step = 0; step < 3; step++) {
        memberships.push({ nodeId: `func:chain${chain}_f${step}`, communityId: 'community:0' });
      }
    }

    const config: Partial<ProcessDetectionConfig> = { maxProcesses: 3 };
    const result = await processProcesses(graph, memberships, undefined, config);

    expect(result.processes.length).toBeLessThanOrEqual(3);
    expect(result.stats.totalProcesses).toBeLessThanOrEqual(3);
  });
});
