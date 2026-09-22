import type { GraphNode, GraphRelationship, KnowledgeGraph } from '../graph/types.js';
import { generateId } from '../../lib/utils.js';

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
const SYNTHETIC_RUNTIME_ROOT_ID = generateId('Method', SYNTHETIC_RUNTIME_ROOT_NAME);

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
  runtimeRootNodeId?: string;
}

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
    };
  }

  ensureRuntimeRootNode(graph);

  const existingPairs = new Set<string>();
  for (const rel of graph.iterRelationships()) {
    if (rel.type === 'CALLS') existingPairs.add(`${rel.sourceId}->${rel.targetId}`);
  }

  const syntheticEdgesPerClass = new Map<string, number>();
  let syntheticEdgeCount = 0;
  let lifecycleEdgeCount = 0;

  for (const host of acceptedHosts) {
    const classId = host.classNode.id;
    for (const callback of host.lifecycleCallbacks) {
      const classCount = syntheticEdgesPerClass.get(classId) ?? 0;
      if (syntheticEdgeCount >= cfg.maxSyntheticEdgesTotal) break;
      if (classCount >= cfg.maxSyntheticEdgesPerClass) break;

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
      syntheticEdgeCount += 1;
      lifecycleEdgeCount += 1;
      syntheticEdgesPerClass.set(classId, classCount + 1);
    }
  }

  return {
    syntheticEdgeCount,
    lifecycleEdgeCount,
    loaderEdgeCount: 0,
    hostCount: acceptedHosts.length,
    rejectedHostCount,
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
