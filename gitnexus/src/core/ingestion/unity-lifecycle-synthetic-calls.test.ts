import { describe, it, expect } from 'vitest';

import { generateId } from '../../lib/utils.js';
import { createKnowledgeGraph } from '../graph/graph.js';
import {
  applyUnityLifecycleSyntheticCalls,
  detectUnityLifecycleHosts,
} from './unity-lifecycle-synthetic-calls.js';

const PLACEHOLDER_RE = /(TODO|TBD|\/placeholder\/)/i;

const addClass = (
  graph: ReturnType<typeof createKnowledgeGraph>,
  input: {
    className: string;
    filePath: string;
    baseType?: string;
    callbackNames?: string[];
    loaderNames?: string[];
    extraMethods?: string[];
  },
) => {
  const classId = generateId('Class', `${input.filePath}:${input.className}`);
  graph.addNode({
    id: classId,
    label: 'Class',
    properties: {
      name: input.className,
      filePath: input.filePath,
    },
  });

  if (input.baseType) {
    const baseTypeId = generateId('Type', input.baseType);
    graph.addNode({
      id: baseTypeId,
      label: 'Type',
      properties: {
        name: input.baseType,
        filePath: '',
      },
    });
    graph.addRelationship({
      id: generateId('EXTENDS', `${classId}->${baseTypeId}`),
      type: 'EXTENDS',
      sourceId: classId,
      targetId: baseTypeId,
      confidence: 1,
      reason: 'test-fixture',
    });
  }

  const methodNames = [
    ...(input.callbackNames ?? []),
    ...(input.loaderNames ?? []),
    ...(input.extraMethods ?? []),
  ];

  for (const methodName of methodNames) {
    const methodId = generateId('Method', `${input.filePath}:${input.className}.${methodName}`);
    graph.addNode({
      id: methodId,
      label: 'Method',
      properties: {
        name: methodName,
        filePath: input.filePath,
      },
    });
    graph.addRelationship({
      id: generateId('HAS_METHOD', `${classId}->${methodId}`),
      type: 'HAS_METHOD',
      sourceId: classId,
      targetId: methodId,
      confidence: 1,
      reason: 'test-fixture',
    });
  }

  return classId;
};

it('detects Unity lifecycle hosts and callback anchors', () => {
  const graph = createKnowledgeGraph();

  const monoClassId = addClass(graph, {
    className: 'GunGraphMB',
    filePath: 'Assets/Scripts/GunGraphMB.cs',
    baseType: 'MonoBehaviour',
    callbackNames: ['Awake', 'OnEnable', 'Start', 'Update'],
    loaderNames: ['RegisterEvents', 'StartRoutineWithEvents'],
  });

  addClass(graph, {
    className: 'ReloadConfig',
    filePath: 'Assets/Scripts/ReloadConfig.cs',
    baseType: 'ScriptableObject',
    callbackNames: ['OnEnable'],
    loaderNames: ['GetValue', 'CheckReload'],
  });

  addClass(graph, {
    className: 'PlainService',
    filePath: 'Assets/Scripts/PlainService.cs',
    callbackNames: ['Start'],
    extraMethods: ['DoWork'],
  });

  const hosts = detectUnityLifecycleHosts(graph);
  const hostIds = new Set(hosts.map((host) => host.classNode.id));

  expect(hostIds.has(monoClassId)).toBe(true);
  expect(hosts.length >= 2).toBe(true);
  expect(hosts.some((host) => host.baseType === 'MonoBehaviour')).toBe(true);
  expect(hosts.some((host) => host.baseType === 'ScriptableObject')).toBe(true);
  expect(hosts.some((host) => host.classNode.properties.name === 'PlainService')).toBe(false);

  const monoHost = hosts.find((host) => host.classNode.id === monoClassId);
  expect(monoHost).toBeTruthy();
  expect(monoHost.lifecycleCallbacks.map((method) => method.properties.name).sort()).toEqual(['Awake', 'OnEnable', 'Start', 'Update'],);
});

it('emits bounded synthetic CALLS edges with reason tags', () => {
  const graph = createKnowledgeGraph();
  const plainClassId = addClass(graph, {
    className: 'PlainService',
    filePath: 'Assets/Scripts/PlainService.cs',
    callbackNames: ['Start'],
    extraMethods: ['DoWork'],
  });

  addClass(graph, {
    className: 'GunGraphMB',
    filePath: 'Assets/Scripts/GunGraphMB.cs',
    baseType: 'MonoBehaviour',
    callbackNames: ['Awake', 'Start'],
    loaderNames: ['RegisterEvents', 'StartRoutineWithEvents'],
  });

  addClass(graph, {
    className: 'ReloadConfig',
    filePath: 'Assets/Scripts/ReloadConfig.cs',
    baseType: 'ScriptableObject',
    callbackNames: ['OnEnable'],
    loaderNames: ['GetValue', 'CheckReload'],
  });

  const result = applyUnityLifecycleSyntheticCalls(graph, {
    enabled: true,
    maxSyntheticEdgesPerClass: 4,
    maxSyntheticEdgesTotal: 10,
  });

  const edges = [...graph.iterRelationships()].filter((edge) => edge.reason.includes('unity-'));
  const plainMethods = new Set(
    [...graph.iterRelationships()]
      .filter((edge) => edge.type === 'HAS_METHOD' && edge.sourceId === plainClassId)
      .map((edge) => edge.targetId),
  );

  expect(result.syntheticEdgeCount).toBe(edges.length);
  expect(result.syntheticEdgeCount > 0).toBe(true);
  expect(result.syntheticEdgeCount <= 10).toBe(true);
  expect(edges.every((edge) => edge.type === 'CALLS')).toBe(true);
  expect(edges.every((edge) => edge.confidence < 1)).toBe(true);
  expect(edges.every((edge) => /unity-(lifecycle|runtime-loader)-synthetic/.test(edge.reason))).toBe(true,);
  expect(edges.some((edge) => edge.sourceId.includes('unity-runtime-root'))).toBe(true);
  expect(edges.some((edge) => plainMethods.has(edge.sourceId) || plainMethods.has(edge.targetId))).toBe(false,);
});

it('rejects placeholder paths and fake compliance', () => {
  const graph = createKnowledgeGraph();
  addClass(graph, {
    className: 'FakeHost',
    filePath: '/placeholder/FakeHost.cs',
    baseType: 'MonoBehaviour',
    callbackNames: ['Awake'],
    loaderNames: ['RegisterEvents'],
  });
  addClass(graph, {
    className: 'RealHost',
    filePath: 'Assets/Scripts/RealHost.cs',
    baseType: 'MonoBehaviour',
    callbackNames: ['Awake'],
    loaderNames: ['RegisterEvents'],
  });

  const result = applyUnityLifecycleSyntheticCalls(graph, {
    enabled: true,
    maxSyntheticEdgesPerClass: 4,
    maxSyntheticEdgesTotal: 8,
  });

  const syntheticRoot = [...graph.iterNodes()].find(
    (node) => node.label === 'Method' && node.properties.name === 'unity-runtime-root',
  );
  const syntheticEdges = [...graph.iterRelationships()].filter((edge) => edge.reason.includes('unity-'));

  expect(result.rejectedHostCount >= 1).toBe(true);
  expect(result.syntheticEdgeCount > 0).toBe(true);
  expect(syntheticRoot).toBeTruthy();
  expect(syntheticRoot.properties.filePath === '' || !PLACEHOLDER_RE.test(syntheticRoot.properties.filePath)).toBe(true);
  expect(syntheticEdges.every((edge) => !PLACEHOLDER_RE.test(`${edge.sourceId} ${edge.targetId} ${edge.reason}`))).toBe(true,);
});

it('emits no synthetic edges when there is no Unity host signal', () => {
  const graph = createKnowledgeGraph();
  addClass(graph, {
    className: 'PlainService',
    filePath: 'Assets/Scripts/PlainService.cs',
    callbackNames: ['Start', 'Update'],
    loaderNames: ['RegisterEvents', 'CheckReload'],
  });

  const result = applyUnityLifecycleSyntheticCalls(graph, {
    enabled: true,
    maxSyntheticEdgesPerClass: 4,
    maxSyntheticEdgesTotal: 8,
  });

  const syntheticEdges = [...graph.iterRelationships()].filter((edge) => edge.reason.includes('unity-'));
  const runtimeRoot = [...graph.iterNodes()].find((node) => node.id.includes('unity-runtime-root'));

  expect(result.syntheticEdgeCount).toBe(0);
  expect(syntheticEdges.length).toBe(0);
  expect(runtimeRoot).toBe(undefined);
});

it('detects Unity hosts through transitive inheritance chains', () => {
  const graph = createKnowledgeGraph();

  const scriptableObjectId = generateId('Type', 'ScriptableObject');
  graph.addNode({
    id: scriptableObjectId,
    label: 'Type',
    properties: {
      name: 'ScriptableObject',
      filePath: '',
    },
  });

  const nodeGraphId = generateId('Class', 'Packages/com.example/NodeGraph.cs:NodeGraph');
  graph.addNode({
    id: nodeGraphId,
    label: 'Class',
    properties: {
      name: 'NodeGraph',
      filePath: 'Packages/com.example/NodeGraph.cs',
    },
  });
  graph.addRelationship({
    id: generateId('EXTENDS', `${nodeGraphId}->${scriptableObjectId}`),
    type: 'EXTENDS',
    sourceId: nodeGraphId,
    targetId: scriptableObjectId,
    confidence: 1,
    reason: 'test-fixture',
  });

  const gameNodeGraphId = generateId('Class', 'Assets/NEON/Code/Game/Graph/Graphs/GameNodeGraph.cs:GameNodeGraph');
  graph.addNode({
    id: gameNodeGraphId,
    label: 'Class',
    properties: {
      name: 'GameNodeGraph',
      filePath: 'Assets/NEON/Code/Game/Graph/Graphs/GameNodeGraph.cs',
    },
  });
  graph.addRelationship({
    id: generateId('EXTENDS', `${gameNodeGraphId}->${nodeGraphId}`),
    type: 'EXTENDS',
    sourceId: gameNodeGraphId,
    targetId: nodeGraphId,
    confidence: 1,
    reason: 'test-fixture',
  });

  const gunGraphId = addClass(graph, {
    className: 'GunGraph',
    filePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
    callbackNames: ['OnEnable'],
    loaderNames: ['RegisterEvents', 'StartRoutineWithEvents'],
  });
  graph.addRelationship({
    id: generateId('EXTENDS', `${gunGraphId}->${gameNodeGraphId}`),
    type: 'EXTENDS',
    sourceId: gunGraphId,
    targetId: gameNodeGraphId,
    confidence: 1,
    reason: 'test-fixture',
  });

  const hosts = detectUnityLifecycleHosts(graph);
  const gunGraphHost = hosts.find((host) => host.classNode.id === gunGraphId);

  expect(gunGraphHost).toBeTruthy();
  expect(gunGraphHost.baseType).toBe('ScriptableObject');
  expect(gunGraphHost.methods.length > 0).toBeTruthy();
});

it('respects global lifecycle edge budget without emitting loader bridges', () => {
  const graph = createKnowledgeGraph();

  for (let i = 0; i < 6; i += 1) {
    addClass(graph, {
      className: `GenericHost${i}`,
      filePath: `Assets/Scripts/GenericHost${i}.cs`,
      baseType: 'MonoBehaviour',
      callbackNames: ['Awake', 'Start'],
      loaderNames: i % 2 === 0 ? ['RegisterEvents'] : [],
    });
  }

  addClass(graph, {
    className: 'GunGraphMB',
    filePath: 'Assets/NEON/Code/Game/Core/GunGraphMB.cs',
    baseType: 'MonoBehaviour',
    callbackNames: ['Awake', 'OnEnable'],
    loaderNames: ['RegisterGraphEvents', 'RegisterEvents', 'StartRoutineWithEvents'],
  });

  addClass(graph, {
    className: 'ReloadConfig',
    filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadConfig.cs',
    baseType: 'ScriptableObject',
    callbackNames: ['OnEnable'],
    loaderNames: ['GetValue', 'CheckReload', 'ReloadRoutine'],
  });

  const result = applyUnityLifecycleSyntheticCalls(graph, {
    enabled: true,
    maxSyntheticEdgesPerClass: 4,
    maxSyntheticEdgesTotal: 8,
  });

  const lifecycleEdges = [...graph.iterRelationships()].filter(
    (edge) => edge.type === 'CALLS' && edge.reason === 'unity-lifecycle-synthetic',
  );
  const loaderEdges = [...graph.iterRelationships()].filter(
    (edge) => edge.type === 'CALLS' && edge.reason === 'unity-runtime-loader-synthetic',
  );

  expect(result.syntheticEdgeCount).toBe(8);
  expect(result.lifecycleEdgeCount).toBe(8);
  expect(result.loaderEdgeCount).toBe(0);
  expect(lifecycleEdges.length).toBe(8);
  expect(loaderEdges.length).toBe(0);
});

it('resolves named class inheritance targets when direct target node lookup is ambiguous', () => {
  const graph = createKnowledgeGraph();

  const nodeGraphId = generateId('Class', 'Assets/Plugins/xNode/Scripts/NodeGraph.cs:NodeGraph');
  graph.addNode({
    id: nodeGraphId,
    label: 'Class',
    properties: {
      name: 'NodeGraph',
      filePath: 'Assets/Plugins/xNode/Scripts/NodeGraph.cs',
    },
  });
  graph.addRelationship({
    id: generateId('EXTENDS', `${nodeGraphId}->Class:ScriptableObject`),
    type: 'EXTENDS',
    sourceId: nodeGraphId,
    targetId: 'Class:ScriptableObject',
    confidence: 1,
    reason: 'test-fixture',
  });

  const gameNodeGraphId = generateId('Class', 'Assets/NEON/Code/Game/Graph/Graphs/GameNodeGraph.cs:GameNodeGraph');
  graph.addNode({
    id: gameNodeGraphId,
    label: 'Class',
    properties: {
      name: 'GameNodeGraph',
      filePath: 'Assets/NEON/Code/Game/Graph/Graphs/GameNodeGraph.cs',
    },
  });
  graph.addRelationship({
    id: generateId('EXTENDS', `${gameNodeGraphId}->Class:NodeGraph`),
    type: 'EXTENDS',
    sourceId: gameNodeGraphId,
    targetId: 'Class:NodeGraph',
    confidence: 1,
    reason: 'test-fixture',
  });

  const gunGraphId = addClass(graph, {
    className: 'GunGraph',
    filePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
    loaderNames: ['RegisterEvents', 'StartRoutineWithEvents'],
  });
  graph.addRelationship({
    id: generateId('EXTENDS', `${gunGraphId}->${gameNodeGraphId}`),
    type: 'EXTENDS',
    sourceId: gunGraphId,
    targetId: gameNodeGraphId,
    confidence: 1,
    reason: 'test-fixture',
  });

  const hosts = detectUnityLifecycleHosts(graph);
  const gunGraphHost = hosts.find((host) => host.classNode.id === gunGraphId);

  expect(gunGraphHost).toBeTruthy();
  expect(gunGraphHost.baseType).toBe('ScriptableObject');
});

it('lifecycle phase does not emit runtime-loader bridge edges', () => {
  const graph = createKnowledgeGraph();

  addClass(graph, {
    className: 'GunGraphMB',
    filePath: 'Assets/NEON/Code/Game/Core/GunGraphMB.cs',
    baseType: 'MonoBehaviour',
    callbackNames: ['Awake', 'OnEnable'],
    loaderNames: ['RegisterGraphEvents'],
  });
  addClass(graph, {
    className: 'BudgetExhauster',
    filePath: 'Assets/NEON/Code/Game/Core/BudgetExhauster.cs',
    baseType: 'MonoBehaviour',
    callbackNames: ['Start'],
  });

  const nodeGraphId = generateId('Class', 'Assets/Plugins/xNode/Scripts/NodeGraph.cs:NodeGraph');
  graph.addNode({
    id: nodeGraphId,
    label: 'Class',
    properties: {
      name: 'NodeGraph',
      filePath: 'Assets/Plugins/xNode/Scripts/NodeGraph.cs',
    },
  });
  graph.addRelationship({
    id: generateId('EXTENDS', `${nodeGraphId}->Class:ScriptableObject`),
    type: 'EXTENDS',
    sourceId: nodeGraphId,
    targetId: 'Class:ScriptableObject',
    confidence: 1,
    reason: 'test-fixture',
  });

  const gameNodeGraphId = generateId('Class', 'Assets/NEON/Code/Game/Graph/Graphs/GameNodeGraph.cs:GameNodeGraph');
  graph.addNode({
    id: gameNodeGraphId,
    label: 'Class',
    properties: {
      name: 'GameNodeGraph',
      filePath: 'Assets/NEON/Code/Game/Graph/Graphs/GameNodeGraph.cs',
    },
  });
  graph.addRelationship({
    id: generateId('EXTENDS', `${gameNodeGraphId}->Class:NodeGraph`),
    type: 'EXTENDS',
    sourceId: gameNodeGraphId,
    targetId: 'Class:NodeGraph',
    confidence: 1,
    reason: 'test-fixture',
  });

  const gunGraphId = addClass(graph, {
    className: 'GunGraph',
    filePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
    loaderNames: ['RegisterEvents', 'StartRoutineWithEvents'],
  });
  graph.addRelationship({
    id: generateId('EXTENDS', `${gunGraphId}->${gameNodeGraphId}`),
    type: 'EXTENDS',
    sourceId: gunGraphId,
    targetId: gameNodeGraphId,
    confidence: 1,
    reason: 'test-fixture',
  });

  const reloadBaseId = addClass(graph, {
    className: 'ReloadBase',
    filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
    loaderNames: ['GetValue', 'CheckReload'],
  });
  graph.addRelationship({
    id: generateId('EXTENDS', `${reloadBaseId}->Class:NodeGraph`),
    type: 'EXTENDS',
    sourceId: reloadBaseId,
    targetId: 'Class:NodeGraph',
    confidence: 1,
    reason: 'test-fixture',
  });

  const reloadId = addClass(graph, {
    className: 'Reload',
    filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs',
    loaderNames: ['ReloadRoutine'],
  });
  graph.addRelationship({
    id: generateId('EXTENDS', `${reloadId}->${reloadBaseId}`),
    type: 'EXTENDS',
    sourceId: reloadId,
    targetId: reloadBaseId,
    confidence: 1,
    reason: 'test-fixture',
  });

  const result = applyUnityLifecycleSyntheticCalls(graph, {
    enabled: true,
    maxSyntheticEdgesPerClass: 12,
    maxSyntheticEdgesTotal: 10,
  });

  const syntheticLoaderEdges = [...graph.iterRelationships()].filter(
    (edge) => edge.type === 'CALLS' && edge.reason === 'unity-runtime-loader-synthetic',
  );
  const lifecycleEdges = [...graph.iterRelationships()].filter(
    (edge) => edge.type === 'CALLS' && edge.reason === 'unity-lifecycle-synthetic',
  );

  expect(result.syntheticEdgeCount).toBe(3);
  expect(result.lifecycleEdgeCount).toBe(3);
  expect(result.loaderEdgeCount).toBe(0);
  expect(lifecycleEdges.length).toBe(3);
  expect(syntheticLoaderEdges.length).toBe(0);
});

it('lifecycle edge cap does not rely on runtime-loader bridge injection', () => {
  const graph = createKnowledgeGraph();

  for (let i = 0; i < 20; i += 1) {
    addClass(graph, {
      className: `NoiseHost${i}`,
      filePath: `Assets/NEON/Code/Game/Core/NoiseHost${i}.cs`,
      baseType: 'MonoBehaviour',
      callbackNames: ['Awake'],
      loaderNames: ['RegisterEvents'],
    });
  }

  addClass(graph, {
    className: 'GunGraphMB',
    filePath: 'Assets/NEON/Code/Game/Core/GunGraphMB.cs',
    baseType: 'MonoBehaviour',
    callbackNames: ['Awake', 'OnEnable'],
    loaderNames: ['RegisterGraphEvents'],
  });

  const nodeGraphId = generateId('Class', 'Assets/Plugins/xNode/Scripts/NodeGraph.cs:NodeGraph');
  graph.addNode({
    id: nodeGraphId,
    label: 'Class',
    properties: {
      name: 'NodeGraph',
      filePath: 'Assets/Plugins/xNode/Scripts/NodeGraph.cs',
    },
  });
  graph.addRelationship({
    id: generateId('EXTENDS', `${nodeGraphId}->Class:ScriptableObject`),
    type: 'EXTENDS',
    sourceId: nodeGraphId,
    targetId: 'Class:ScriptableObject',
    confidence: 1,
    reason: 'test-fixture',
  });

  const gameNodeGraphId = generateId('Class', 'Assets/NEON/Code/Game/Graph/Graphs/GameNodeGraph.cs:GameNodeGraph');
  graph.addNode({
    id: gameNodeGraphId,
    label: 'Class',
    properties: {
      name: 'GameNodeGraph',
      filePath: 'Assets/NEON/Code/Game/Graph/Graphs/GameNodeGraph.cs',
    },
  });
  graph.addRelationship({
    id: generateId('EXTENDS', `${gameNodeGraphId}->Class:NodeGraph`),
    type: 'EXTENDS',
    sourceId: gameNodeGraphId,
    targetId: 'Class:NodeGraph',
    confidence: 1,
    reason: 'test-fixture',
  });

  const gunGraphId = addClass(graph, {
    className: 'GunGraph',
    filePath: 'Assets/NEON/Code/Game/Graph/Graphs/GunGraph.cs',
    loaderNames: ['RegisterEvents', 'StartRoutineWithEvents'],
  });
  graph.addRelationship({
    id: generateId('EXTENDS', `${gunGraphId}->${gameNodeGraphId}`),
    type: 'EXTENDS',
    sourceId: gunGraphId,
    targetId: gameNodeGraphId,
    confidence: 1,
    reason: 'test-fixture',
  });

  const reloadBaseId = addClass(graph, {
    className: 'ReloadBase',
    filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
    loaderNames: ['GetValue', 'CheckReload'],
  });
  graph.addRelationship({
    id: generateId('EXTENDS', `${reloadBaseId}->Class:NodeGraph`),
    type: 'EXTENDS',
    sourceId: reloadBaseId,
    targetId: 'Class:NodeGraph',
    confidence: 1,
    reason: 'test-fixture',
  });

  const reloadId = addClass(graph, {
    className: 'Reload',
    filePath: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/Reload.cs',
    loaderNames: ['ReloadRoutine'],
  });
  graph.addRelationship({
    id: generateId('EXTENDS', `${reloadId}->${reloadBaseId}`),
    type: 'EXTENDS',
    sourceId: reloadId,
    targetId: reloadBaseId,
    confidence: 1,
    reason: 'test-fixture',
  });

  applyUnityLifecycleSyntheticCalls(graph, {
    enabled: true,
    maxSyntheticEdgesPerClass: 12,
    maxSyntheticEdgesTotal: 12,
  });

  const loaderEdges = [...graph.iterRelationships()].filter(
    (edge) => edge.type === 'CALLS' && edge.reason === 'unity-runtime-loader-synthetic',
  );

  expect(loaderEdges.length).toBe(0);
});
