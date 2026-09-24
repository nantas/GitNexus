import test from 'node:test';
import assert from 'node:assert/strict';
import { generateId } from '../../lib/utils.js';
import { createKnowledgeGraph } from '../graph/graph.js';
import {
  applyUnityLifecycleSyntheticCalls,
  detectUnityLifecycleHosts,
  SYNTHETIC_RUNTIME_ROOT_ID,
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

test('detects Unity lifecycle hosts and callback anchors', () => {
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

  assert.equal(hostIds.has(monoClassId), true);
  assert.equal(hosts.length >= 2, true);
  assert.equal(hosts.some((host) => host.baseType === 'MonoBehaviour'), true);
  assert.equal(hosts.some((host) => host.baseType === 'ScriptableObject'), true);
  assert.equal(hosts.some((host) => host.classNode.properties.name === 'PlainService'), false);

  const monoHost = hosts.find((host) => host.classNode.id === monoClassId);
  assert.ok(monoHost);
  assert.deepEqual(
    monoHost.lifecycleCallbacks.map((method) => method.properties.name).sort(),
    ['Awake', 'OnEnable', 'Start', 'Update'],
  );
});

test('emits bounded synthetic CALLS edges with reason tags', () => {
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

  assert.equal(result.syntheticEdgeCount, edges.length);
  assert.equal(result.syntheticEdgeCount > 0, true);
  assert.equal(result.syntheticEdgeCount <= 10, true);
  assert.equal(edges.every((edge) => edge.type === 'CALLS'), true);
  assert.equal(edges.every((edge) => edge.confidence < 1), true);
  assert.equal(
    edges.every((edge) => /unity-(lifecycle|runtime-loader)-synthetic/.test(edge.reason)),
    true,
  );
  assert.equal(edges.some((edge) => edge.sourceId.includes('unity-runtime-root')), true);
  assert.equal(
    edges.some((edge) => plainMethods.has(edge.sourceId) || plainMethods.has(edge.targetId)),
    false,
  );
});

test('rejects placeholder paths and fake compliance', () => {
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

  assert.equal(result.rejectedHostCount >= 1, true);
  assert.equal(result.syntheticEdgeCount > 0, true);
  assert.ok(syntheticRoot);
  assert.equal(syntheticRoot.properties.filePath === '' || !PLACEHOLDER_RE.test(syntheticRoot.properties.filePath), true);
  assert.equal(
    syntheticEdges.every((edge) => !PLACEHOLDER_RE.test(`${edge.sourceId} ${edge.targetId} ${edge.reason}`)),
    true,
  );
});

test('emits no synthetic edges when there is no Unity host signal', () => {
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

  assert.equal(result.syntheticEdgeCount, 0);
  assert.equal(syntheticEdges.length, 0);
  assert.equal(runtimeRoot, undefined);
});

test('detects Unity hosts through transitive inheritance chains', () => {
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

  assert.ok(gunGraphHost);
  assert.equal(gunGraphHost.baseType, 'ScriptableObject');
  assert.ok(gunGraphHost.methods.length > 0);
});

test('respects global lifecycle edge budget without emitting loader bridges', () => {
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

  assert.equal(result.syntheticEdgeCount, 8);
  assert.equal(result.lifecycleEdgeCount, 8);
  assert.equal(result.loaderEdgeCount, 0);
  assert.equal(lifecycleEdges.length, 8);
  assert.equal(loaderEdges.length, 0);
});

test('resolves named class inheritance targets when direct target node lookup is ambiguous', () => {
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

  assert.ok(gunGraphHost);
  assert.equal(gunGraphHost.baseType, 'ScriptableObject');
});

test('lifecycle phase does not emit runtime-loader bridge edges', () => {
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

  assert.equal(result.syntheticEdgeCount, 3);
  assert.equal(result.lifecycleEdgeCount, 3);
  assert.equal(result.loaderEdgeCount, 0);
  assert.equal(lifecycleEdges.length, 3);
  assert.equal(syntheticLoaderEdges.length, 0);
});

test('lifecycle edge cap does not rely on runtime-loader bridge injection', () => {
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

  assert.equal(loaderEdges.length, 0);
});

const selectedCallbacks = (graph: ReturnType<typeof createKnowledgeGraph>): string[] =>
  [...graph.iterRelationships()]
    .filter((edge) => edge.type === 'CALLS' && edge.sourceId === SYNTHETIC_RUNTIME_ROOT_ID)
    .map((edge) => edge.targetId)
    .sort();

test('truncated group reserves hosts, ranks trusted two-hop calls, and ignores heuristic calls', () => {
  const graph = createKnowledgeGraph();
  const callbacks = ['Awake', 'OnEnable', 'Start'];
  for (const className of ['A', 'B', 'C']) {
    addClass(graph, {
      className,
      filePath: `Assets/${className}.cs`,
      baseType: 'MonoBehaviour',
      callbackNames: callbacks,
      extraMethods: ['First', 'Second'],
    });
  }
  const id = (host: string, method: string) => generateId('Method', `Assets/${host}.cs:${host}.${method}`);
  const call = (source: string, target: string, reason = 'local-call', confidence = 1) =>
    graph.addRelationship({ id: generateId('CALLS', `${source}->${target}:${reason}`), sourceId: source, targetId: target, type: 'CALLS', reason, confidence });
  call(id('A', 'Awake'), id('A', 'First'));
  call(id('A', 'First'), id('A', 'Second'));
  call(id('B', 'Start'), id('B', 'First'));
  call(id('C', 'Awake'), id('C', 'First'), 'heuristic-name-match');
  call(id('C', 'OnEnable'), id('C', 'First'), 'local-call', 0.4);

  const result = applyUnityLifecycleSyntheticCalls(graph, { maxSyntheticEdgesTotal: 4 });
  const selected = new Set(selectedCallbacks(graph));
  assert.equal(result.syntheticEdgeCount, 4);
  assert.equal(result.candidateCallbackCount, 9);
  assert.equal(result.truncatedCallbackCount, 5);
  assert.equal(result.uncoveredHostCount, 0);
  assert.equal(result.noTrustedCallsCount >= 1, true);
  assert.equal(result.tiedScoreCount > 0, true);
  assert.equal(selected.has(id('A', 'Awake')), true);
  assert.equal(selected.has(id('B', 'Start')), true);
  assert.equal(selected.has(id('C', 'Awake')), true); // stable tie, no trusted call
  assert.equal(selected.has(id('C', 'OnEnable')), false);
});

test('callback count groups outrank value and report uncovered hosts when slots are fewer', () => {
  const graph = createKnowledgeGraph();
  for (const host of ['A', 'B', 'C']) {
    addClass(graph, { className: host, filePath: `Assets/${host}.cs`, baseType: 'MonoBehaviour', callbackNames: ['Awake', 'Start'] });
  }
  addClass(graph, { className: 'D', filePath: 'Assets/D.cs', baseType: 'MonoBehaviour', callbackNames: ['Awake'], extraMethods: ['Target'] });
  const d = generateId('Method', 'Assets/D.cs:D.Awake');
  graph.addRelationship({ id: 'd-call', sourceId: d, targetId: generateId('Method', 'Assets/D.cs:D.Target'), type: 'CALLS', confidence: 1, reason: 'local-call' });
  const result = applyUnityLifecycleSyntheticCalls(graph, { maxSyntheticEdgesTotal: 2, maxSyntheticEdgesPerClass: 1 });
  assert.equal(result.syntheticEdgeCount, 2);
  assert.equal(result.uncoveredHostCount, 2); // one two-callback host, plus lower group D
  assert.equal(selectedCallbacks(graph).includes(d), false);
  assert.equal(result.uncoveredHostIds.length, 2);
});

test('two-hop value outranks direct-only value when a group has one slot', () => {
  const graph = createKnowledgeGraph();
  for (const host of ['A', 'B']) {
    addClass(graph, { className: host, filePath: `Assets/${host}.cs`, baseType: 'MonoBehaviour', callbackNames: ['Awake'], extraMethods: ['First', 'Second'] });
  }
  const id = (host: string, method: string) => generateId('Method', `Assets/${host}.cs:${host}.${method}`);
  const call = (source: string, target: string) => graph.addRelationship({ id: generateId('CALLS', `${source}->${target}`), sourceId: source, targetId: target, type: 'CALLS', confidence: 1, reason: 'local-call' });
  call(id('A', 'Awake'), id('A', 'First'));
  call(id('B', 'Awake'), id('B', 'First'));
  call(id('B', 'First'), id('B', 'Second'));
  const result = applyUnityLifecycleSyntheticCalls(graph, { maxSyntheticEdgesTotal: 1 });
  assert.deepEqual(selectedCallbacks(graph), [id('B', 'Awake')]);
  assert.equal(result.uncoveredHostCount, 1);
});

test('a truncated host chooses its best callback before the per-class cap applies', () => {
  const graph = createKnowledgeGraph();
  for (const host of ['A', 'B']) {
    addClass(graph, { className: host, filePath: `Assets/${host}.cs`, baseType: 'MonoBehaviour', callbackNames: ['Awake', 'Start'], extraMethods: ['First', 'Second'] });
  }
  const id = (host: string, method: string) => generateId('Method', `Assets/${host}.cs:${host}.${method}`);
  for (const [source, target] of [[id('B', 'Start'), id('B', 'First')], [id('B', 'First'), id('B', 'Second')]]) {
    graph.addRelationship({ id: generateId('CALLS', `${source}->${target}`), sourceId: source, targetId: target, type: 'CALLS', confidence: 1, reason: 'local-call' });
  }
  const result = applyUnityLifecycleSyntheticCalls(graph, { maxSyntheticEdgesTotal: 1, maxSyntheticEdgesPerClass: 1 });
  assert.deepEqual(selectedCallbacks(graph), [id('B', 'Start')]);
  assert.equal(result.candidateCallbackCount, 2);
});

test('selection is invariant under node, edge, and file order permutations', () => {
  const make = (reverse: boolean) => {
    const graph = createKnowledgeGraph();
    const hosts = reverse ? ['C', 'B', 'A'] : ['A', 'B', 'C'];
    for (const host of hosts) {
      addClass(graph, { className: host, filePath: `Assets/${host}.cs`, baseType: 'MonoBehaviour', callbackNames: reverse ? ['Start', 'Awake'] : ['Awake', 'Start'], extraMethods: ['First', 'Second'] });
    }
    const edges = hosts.map((host) => ({
      id: `call-${host}`,
      sourceId: generateId('Method', `Assets/${host}.cs:${host}.Start`),
      targetId: generateId('Method', `Assets/${host}.cs:${host}.First`),
      type: 'CALLS' as const,
      confidence: 1,
      reason: 'local-call',
    }));
    for (const edge of reverse ? edges.reverse() : edges) graph.addRelationship(edge);
    applyUnityLifecycleSyntheticCalls(graph, { maxSyntheticEdgesTotal: 4 });
    return selectedCallbacks(graph);
  };
  assert.deepEqual(make(false), make(true));
});

test('synthetic root never exceeds the unity-processes callback cap', () => {
  const graph = createKnowledgeGraph();
  for (let index = 0; index < 40; index++) {
    addClass(graph, { className: `Host${index}`, filePath: `Assets/Host${index}.cs`, baseType: 'MonoBehaviour', callbackNames: ['Awake', 'OnEnable', 'Start', 'Update', 'FixedUpdate', 'LateUpdate', 'OnDisable', 'OnDestroy'] });
  }
  const result = applyUnityLifecycleSyntheticCalls(graph, { maxSyntheticEdgesTotal: 500 });
  assert.equal(result.syntheticEdgeCount, 256);
  assert.equal(result.truncatedCallbackCount, 64);
  assert.equal(selectedCallbacks(graph).length, 256);
  assert.equal(result.uncoveredHostCount, 0);
});

test('existing synthetic root edges consume the total budget', () => {
  const graph = createKnowledgeGraph();
  addClass(graph, { className: 'A', filePath: 'Assets/A.cs', baseType: 'MonoBehaviour', callbackNames: ['Awake', 'Start'] });
  addClass(graph, { className: 'B', filePath: 'Assets/B.cs', baseType: 'MonoBehaviour', callbackNames: ['Awake', 'Start'] });
  graph.addNode({ id: SYNTHETIC_RUNTIME_ROOT_ID, label: 'Method', properties: { name: 'unity-runtime-root', filePath: '' } });
  graph.addRelationship({ id: 'preexisting-root', sourceId: SYNTHETIC_RUNTIME_ROOT_ID, targetId: generateId('Method', 'Assets/A.cs:A.Awake'), type: 'CALLS', confidence: 0.72, reason: 'unity-lifecycle-synthetic' });
  const result = applyUnityLifecycleSyntheticCalls(graph, { maxSyntheticEdgesTotal: 2, maxSyntheticEdgesPerClass: 1 });
  assert.equal(result.syntheticEdgeCount, 1);
  assert.equal(selectedCallbacks(graph).length, 2);
  assert.equal(selectedCallbacks(graph).some((id) => id === generateId('Method', 'Assets/A.cs:A.Start')), false);
});
