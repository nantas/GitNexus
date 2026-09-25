import type { GraphNode, GraphRelationship, KnowledgeGraph } from '../graph/types.js';
import { generateId } from '../../lib/utils.js';
import { isHeuristicEdgeReason } from '../graph/edge-reasons.js';

const PLACEHOLDER_RE = /(TODO|TBD|\/placeholder\/)/i;
const UNITY_MONOBEHAVIOUR = 'MonoBehaviour';
const UNITY_SCRIPTABLE_OBJECT = 'ScriptableObject';

const LIFECYCLE_CALLBACKS = new Set([
  'Awake',
  'OnEnable',
  'Start',
  'Update',
  'FixedUpdate',
  'LateUpdate',
  'OnDisable',
  'OnDestroy',
]);

const SYNTHETIC_RUNTIME_ROOT_NAME = 'unity-runtime-root';
const MAX_PROCESS_CALLBACKS = 256;
export const SYNTHETIC_RUNTIME_ROOT_ID = generateId('Method', SYNTHETIC_RUNTIME_ROOT_NAME);

export interface UnityLifecycleSyntheticConfig {
  enabled: boolean;
  maxSyntheticEdgesPerClass: number;
  maxSyntheticEdgesTotal: number;
  lifecycleEdgeConfidence: number;
}

export const DEFAULT_UNITY_LIFECYCLE_SYNTHETIC_CONFIG: UnityLifecycleSyntheticConfig = {
  enabled: true,
  maxSyntheticEdgesPerClass: 12,
  maxSyntheticEdgesTotal: 256,
  lifecycleEdgeConfidence: 0.72,
};

export interface UnityLifecycleHost {
  classNode: GraphNode;
  baseType: 'MonoBehaviour' | 'ScriptableObject';
  lifecycleCallbacks: GraphNode[];
  methods: GraphNode[];
}

export interface UnityLifecycleSyntheticResult {
  syntheticEdgeCount: number;
  lifecycleEdgeCount: number;
  loaderEdgeCount: number;
  hostCount: number;
  rejectedHostCount: number;
  candidateCallbackCount: number;
  truncatedCallbackCount: number;
  uncoveredHostCount: number;
  uncoveredHostIds: string[];
  noTrustedCallsCount: number;
  tiedScoreCount: number;
  runtimeRootNodeId?: string;
}

interface CallbackCandidate {
  host: UnityLifecycleHost;
  callback: GraphNode;
  score: CallbackScore;
}

interface CallbackScore {
  hasTwoHop: boolean;
  twoHopPathCount: number;
  hasDirectCall: boolean;
  directTargetCount: number;
}

const EMPTY_CALLBACK_SCORE: CallbackScore = {
  hasTwoHop: false,
  twoHopPathCount: 0,
  hasDirectCall: false,
  directTargetCount: 0,
};

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const normalizedPath = (node: GraphNode): string =>
  String(node.properties.filePath ?? '').replaceAll('\\', '/');

const compareCandidateIdentity = (left: CallbackCandidate, right: CallbackCandidate): number =>
  compareText(normalizedPath(left.host.classNode), normalizedPath(right.host.classNode)) ||
  compareText(String(left.host.classNode.properties.name), String(right.host.classNode.properties.name)) ||
  compareText(String(left.callback.properties.name), String(right.callback.properties.name)) ||
  compareText(left.callback.id, right.callback.id) ||
  compareText(left.host.classNode.id, right.host.classNode.id);

const compareCandidateValue = (left: CallbackCandidate, right: CallbackCandidate): number => {
  return (
    Number(right.score.hasTwoHop) - Number(left.score.hasTwoHop) ||
    right.score.twoHopPathCount - left.score.twoHopPathCount ||
    Number(right.score.hasDirectCall) - Number(left.score.hasDirectCall) ||
    right.score.directTargetCount - left.score.directTargetCount ||
    compareCandidateIdentity(left, right)
  );
};

const sameCandidateValue = (left: CallbackCandidate, right: CallbackCandidate): boolean =>
  left.score.hasTwoHop === right.score.hasTwoHop &&
  left.score.twoHopPathCount === right.score.twoHopPathCount &&
  left.score.hasDirectCall === right.score.hasDirectCall &&
  left.score.directTargetCount === right.score.directTargetCount;

const trustedCalls = (graph: KnowledgeGraph): Map<string, Set<string>> => {
  const calls = new Map<string, Set<string>>();
  for (const rel of graph.iterRelationships()) {
    if (rel.type !== 'CALLS' || !(rel.confidence >= 0.5) || isHeuristicEdgeReason(rel.reason)) continue;
    if (!graph.getNode(rel.sourceId) || !graph.getNode(rel.targetId)) continue;
    const targets = calls.get(rel.sourceId) ?? new Set<string>();
    targets.add(rel.targetId);
    calls.set(rel.sourceId, targets);
  }
  return calls;
};

const scoreCallback = (
  callbackId: string,
  calls: ReadonlyMap<string, ReadonlySet<string>>,
): CallbackCandidate['score'] => {
  const direct = [...(calls.get(callbackId) ?? [])].filter((id) => id !== callbackId);
  let twoHopPaths = 0;
  for (const callee of direct) {
    for (const terminal of calls.get(callee) ?? []) {
      if (terminal !== callbackId && terminal !== callee) twoHopPaths++;
      if (twoHopPaths >= 4) break;
    }
    if (twoHopPaths >= 4) break;
  }
  return {
    hasTwoHop: twoHopPaths > 0,
    twoHopPathCount: Math.min(4, twoHopPaths),
    hasDirectCall: direct.length > 0,
    directTargetCount: Math.min(4, direct.length),
  };
};

export const detectUnityLifecycleHosts = (
  graph: KnowledgeGraph,
  declaredBases: ReadonlyMap<string, readonly string[]> = new Map(),
): UnityLifecycleHost[] => {
  const methodsByClass = new Map<string, GraphNode[]>();
  for (const rel of graph.iterRelationships()) {
    if (rel.type !== 'HAS_METHOD') continue;
    const method = graph.getNode(rel.targetId);
    if (!method) continue;
    if (method.label !== 'Method' && method.label !== 'Function') continue;
    const methods = methodsByClass.get(rel.sourceId) ?? [];
    methods.push(method);
    methodsByClass.set(rel.sourceId, methods);
  }

  const extendsByClass = new Map<string, GraphRelationship[]>();
  for (const rel of graph.iterRelationships()) {
    if (rel.type !== 'EXTENDS' && rel.type !== 'INHERITS') continue;
    const edges = extendsByClass.get(rel.sourceId) ?? [];
    edges.push(rel);
    extendsByClass.set(rel.sourceId, edges);
  }

  const classIdsByName = new Map<string, string[]>();
  for (const node of graph.iterNodes()) {
    if (node.label !== 'Class') continue;
    const ids = classIdsByName.get(String(node.properties.name)) ?? [];
    ids.push(node.id);
    classIdsByName.set(String(node.properties.name), ids);
  }

  const hosts: UnityLifecycleHost[] = [];
  for (const node of graph.iterNodes()) {
    if (node.label !== 'Class') continue;
    const baseType = resolveUnityBaseType(
      graph,
      extendsByClass,
      classIdsByName,
      node.id,
      declaredBases,
    );
    if (!baseType) continue;
    const methods = methodsByClass.get(node.id) ?? [];
    const lifecycleCallbacks = methods.filter((method) =>
      LIFECYCLE_CALLBACKS.has(method.properties.name),
    );
    hosts.push({
      classNode: node,
      baseType,
      lifecycleCallbacks: sortMethodsByName(lifecycleCallbacks),
      methods: sortMethodsByName(methods),
    });
  }

  return hosts;
};

export const applyUnityLifecycleSyntheticCalls = (
  graph: KnowledgeGraph,
  config: Partial<UnityLifecycleSyntheticConfig> = {},
  declaredBases: ReadonlyMap<string, readonly string[]> = new Map(),
): UnityLifecycleSyntheticResult => {
  const cfg: UnityLifecycleSyntheticConfig = {
    ...DEFAULT_UNITY_LIFECYCLE_SYNTHETIC_CONFIG,
    ...config,
  };

  const hosts = detectUnityLifecycleHosts(graph, declaredBases);
  const acceptedHosts: UnityLifecycleHost[] = [];
  let rejectedHostCount = 0;

  for (const host of hosts) {
    if (isPlaceholderHost(host)) {
      rejectedHostCount += 1;
      continue;
    }
    acceptedHosts.push(host);
  }

  acceptedHosts.sort(
    (left, right) => right.lifecycleCallbacks.length - left.lifecycleCallbacks.length,
  );

  if (acceptedHosts.length === 0) {
    return {
      syntheticEdgeCount: 0,
      lifecycleEdgeCount: 0,
      loaderEdgeCount: 0,
      hostCount: 0,
      rejectedHostCount,
      candidateCallbackCount: 0,
      truncatedCallbackCount: 0,
      uncoveredHostCount: 0,
      uncoveredHostIds: [],
      noTrustedCallsCount: 0,
      tiedScoreCount: 0,
    };
  }

  ensureRuntimeRootNode(graph);

  const existingPairs = new Set<string>();
  const existingRootCallbacks = new Set<string>();
  for (const rel of graph.iterRelationships()) {
    if (rel.type !== 'CALLS') continue;
    existingPairs.add(`${rel.sourceId}->${rel.targetId}`);
    if (rel.sourceId === SYNTHETIC_RUNTIME_ROOT_ID && rel.reason === 'unity-lifecycle-synthetic') {
      existingRootCallbacks.add(rel.targetId);
    }
  }

  const budget = Math.max(0, Math.min(MAX_PROCESS_CALLBACKS, cfg.maxSyntheticEdgesTotal) - existingRootCallbacks.size);
  const perClassBudget = Math.max(0, cfg.maxSyntheticEdgesPerClass);
  const allowanceByHost = new Map(acceptedHosts.map((host) => [
    host.classNode.id,
    Math.max(0, perClassBudget - host.lifecycleCallbacks.filter((callback) => existingRootCallbacks.has(callback.id)).length),
  ]));
  const candidatesByGroup = new Map<number, CallbackCandidate[]>();
  for (const host of acceptedHosts) {
    const group = candidatesByGroup.get(host.lifecycleCallbacks.length) ?? [];
    for (const callback of host.lifecycleCallbacks) {
      if (existingPairs.has(`${SYNTHETIC_RUNTIME_ROOT_ID}->${callback.id}`)) continue;
      group.push({ host, callback, score: EMPTY_CALLBACK_SCORE });
    }
    candidatesByGroup.set(host.lifecycleCallbacks.length, group);
  }
  const groupCapacity = (group: CallbackCandidate[]): number => {
    const perHost = new Map<string, number>();
    for (const item of group) perHost.set(item.host.classNode.id, (perHost.get(item.host.classNode.id) ?? 0) + 1);
    return [...perHost].reduce((sum, [hostId, count]) => sum + Math.min(count, allowanceByHost.get(hostId) ?? 0), 0);
  };
  const candidateCallbackCount = [...candidatesByGroup.values()].reduce((sum, group) => sum + groupCapacity(group), 0);
  const selected: CallbackCandidate[] = [];
  let tiedScoreCount = 0;
  const alreadyCoveredHosts = new Set(
    acceptedHosts
      .filter((host) => host.lifecycleCallbacks.some((callback) => existingRootCallbacks.has(callback.id)))
      .map((host) => host.classNode.id),
  );
  let calls: Map<string, Set<string>> | undefined;

  for (const count of [...candidatesByGroup.keys()].sort((a, b) => b - a)) {
    const group = candidatesByGroup.get(count)!;
    const capacity = groupCapacity(group);
    if (capacity === 0) continue;
    const remaining = budget - selected.length;
    if (remaining <= 0) continue;
    if (capacity <= remaining) {
      const perHost = new Map<string, number>();
      for (const item of group.sort(compareCandidateIdentity)) {
        const hostId = item.host.classNode.id;
        const count = perHost.get(hostId) ?? 0;
        if (count >= (allowanceByHost.get(hostId) ?? 0)) continue;
        selected.push(item);
        perHost.set(hostId, count + 1);
      }
      continue;
    }

    calls ??= trustedCalls(graph);
    const ranked = group.map((item) => ({ ...item, score: scoreCallback(item.callback.id, calls!) })).sort(compareCandidateValue);
    for (let index = 1; index < ranked.length; index++) {
      if (sameCandidateValue(ranked[index], ranked[index - 1])) tiedScoreCount++;
    }
    const bestByHost = new Map<string, CallbackCandidate>();
    for (const item of ranked) {
      if ((allowanceByHost.get(item.host.classNode.id) ?? 0) > 0 && !bestByHost.has(item.host.classNode.id)) {
        bestByHost.set(item.host.classNode.id, item);
      }
    }
    const reservations = [...bestByHost.values()]
      .filter((item) => !alreadyCoveredHosts.has(item.host.classNode.id))
      .sort(compareCandidateValue)
      .slice(0, remaining);
    const reservedIds = new Set(reservations.map((item) => item.callback.id));
    const perHost = new Map(reservations.map((item) => [item.host.classNode.id, 1]));
    const remainingSelections: CallbackCandidate[] = [];
    for (const item of ranked) {
      if (remainingSelections.length >= remaining - reservations.length) break;
      if (reservedIds.has(item.callback.id)) continue;
      const hostId = item.host.classNode.id;
      const count = perHost.get(hostId) ?? 0;
      if (count >= (allowanceByHost.get(hostId) ?? 0)) continue;
      remainingSelections.push(item);
      perHost.set(hostId, count + 1);
    }
    selected.push(...reservations, ...remainingSelections);
  }

  const coveredHostIds = new Set([
    ...alreadyCoveredHosts,
    ...selected.map((item) => item.host.classNode.id),
  ]);
  const uncoveredHostIds = acceptedHosts
    .filter((host) => host.lifecycleCallbacks.length > 0 && !coveredHostIds.has(host.classNode.id))
    .map((host) => host.classNode.id)
    .sort(compareText);
  const callsForDiagnostics = calls ?? trustedCalls(graph);
  const noTrustedCallsCount = selected.filter((item) =>
    ![...(callsForDiagnostics.get(item.callback.id) ?? [])].some((target) => target !== item.callback.id),
  ).length;

  let syntheticEdgeCount = 0;
  let lifecycleEdgeCount = 0;
  for (const { callback } of selected) {
    const pairKey = `${SYNTHETIC_RUNTIME_ROOT_ID}->${callback.id}`;
    if (existingPairs.has(pairKey)) continue;
    graph.addRelationship({
      id: generateId(
        'CALLS',
        `${SYNTHETIC_RUNTIME_ROOT_ID}->${callback.id}:unity-lifecycle-synthetic`,
      ),
      sourceId: SYNTHETIC_RUNTIME_ROOT_ID,
      targetId: callback.id,
      type: 'CALLS',
      confidence: cfg.lifecycleEdgeConfidence,
      reason: 'unity-lifecycle-synthetic',
    });
    existingPairs.add(pairKey);
    syntheticEdgeCount++;
    lifecycleEdgeCount++;
  }

  return {
    syntheticEdgeCount,
    lifecycleEdgeCount,
    loaderEdgeCount: 0,
    hostCount: acceptedHosts.length,
    rejectedHostCount,
    candidateCallbackCount,
    truncatedCallbackCount: candidateCallbackCount - syntheticEdgeCount,
    uncoveredHostCount: uncoveredHostIds.length,
    uncoveredHostIds,
    noTrustedCallsCount,
    tiedScoreCount,
    runtimeRootNodeId: syntheticEdgeCount > 0 ? SYNTHETIC_RUNTIME_ROOT_ID : undefined,
  };
};

const resolveUnityBaseType = (
  graph: KnowledgeGraph,
  extendsByClass: Map<string, GraphRelationship[]>,
  classIdsByName: Map<string, string[]>,
  classId: string,
  declaredBases: ReadonlyMap<string, readonly string[]>,
  visited = new Set<string>(),
): 'MonoBehaviour' | 'ScriptableObject' | undefined => {
  if (visited.has(classId)) return undefined;
  visited.add(classId);
  for (const name of declaredBases.get(classId) ?? []) {
    if (/^(?:global::)?(?:UnityEngine\.)?(MonoBehaviour|ScriptableObject)$/.test(name)) {
      return name.endsWith('MonoBehaviour') ? 'MonoBehaviour' : 'ScriptableObject';
    }
  }

  for (const edge of extendsByClass.get(classId) ?? []) {
    const targetNode = graph.getNode(edge.targetId);
    const candidates = [targetNode?.properties?.name ?? '', edge.targetId, edge.reason];
    for (const candidate of candidates) {
      const normalized = normalizeBaseType(candidate);
      if (normalized) return normalized;
    }

    if (targetNode?.label === 'Class') {
      const inherited = resolveUnityBaseType(
        graph,
        extendsByClass,
        classIdsByName,
        targetNode.id,
        declaredBases,
        visited,
      );
      if (inherited) return inherited;
    }

    for (const candidateId of resolveNamedClassTargets(classIdsByName, edge.targetId)) {
      const inherited = resolveUnityBaseType(
        graph,
        extendsByClass,
        classIdsByName,
        candidateId,
        declaredBases,
        visited,
      );
      if (inherited) return inherited;
    }
  }
  return undefined;
};

const normalizeBaseType = (value: string): 'MonoBehaviour' | 'ScriptableObject' | undefined => {
  const text = String(value || '').trim();
  if (!text) return undefined;
  if (text.endsWith(UNITY_MONOBEHAVIOUR) || text.includes(`.${UNITY_MONOBEHAVIOUR}`))
    return UNITY_MONOBEHAVIOUR;
  if (text.endsWith(UNITY_SCRIPTABLE_OBJECT) || text.includes(`.${UNITY_SCRIPTABLE_OBJECT}`))
    return UNITY_SCRIPTABLE_OBJECT;
  return undefined;
};

const ensureRuntimeRootNode = (graph: KnowledgeGraph): void => {
  if (graph.getNode(SYNTHETIC_RUNTIME_ROOT_ID)) return;
  graph.addNode({
    id: SYNTHETIC_RUNTIME_ROOT_ID,
    label: 'Method',
    properties: { name: SYNTHETIC_RUNTIME_ROOT_NAME, filePath: '' },
  });
};

const isPlaceholderHost = (host: UnityLifecycleHost): boolean => {
  if (PLACEHOLDER_RE.test(host.classNode.properties.filePath)) return true;
  for (const method of host.methods) {
    if (PLACEHOLDER_RE.test(method.properties.filePath)) return true;
  }
  return false;
};

const sortMethodsByName = (methods: GraphNode[]): GraphNode[] =>
  [...methods].sort((left, right) => {
    const byName = String(left.properties.name).localeCompare(String(right.properties.name));
    if (byName !== 0) return byName;
    return left.id.localeCompare(right.id);
  });

const resolveNamedClassTargets = (
  classIdsByName: Map<string, string[]>,
  rawTargetId: string,
): string[] => {
  const text = String(rawTargetId || '').trim();
  if (!text.startsWith('Class:')) return [];
  return classIdsByName.get(text.slice('Class:'.length)) ?? [];
};
