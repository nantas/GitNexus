import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateId } from '../../lib/utils.js';
import { createKnowledgeGraph } from '../graph/graph.js';
import { closeLbug, executeQuery, initLbug, loadGraphToLbug } from '../lbug/lbug-adapter.js';
import { buildUnityScanContext } from '../unity/scan-context.js';
import { streamPrefabSourceRefs } from '../unity/prefab-source-scan.js';
import { processUnityResources } from './unity-resource-processor.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity');
const symbols = ['Global', 'BattleMode', 'PlayerActor', 'MainUIManager'];

const listRelativeFixtureFiles = async (root: string): Promise<string[]> => {
  const out: string[] = [];
  const stack = ['.'];

  while (stack.length > 0) {
    const relDir = stack.pop()!;
    const absDir = path.join(root, relDir);
    const entries = await fs.readdir(absDir, { withFileTypes: true });

    for (const entry of entries) {
      const relPath = path.join(relDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(relPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      out.push(relPath.startsWith('./') ? relPath.slice(2) : relPath);
    }
  }

  return out;
};

test('processUnityResources emits schema-compatible component-instance edges and materialized resource file nodes', async () => {
  const graph = createKnowledgeGraph();

  for (const symbol of symbols) {
    const filePath = `Assets/Scripts/${symbol}.cs`;
    const fileId = generateId('File', filePath);
    const classId = generateId('Class', `${filePath}:${symbol}`);

    graph.addNode({
      id: fileId,
      label: 'File',
      properties: {
        name: `${symbol}.cs`,
        filePath,
      },
    });

    graph.addNode({
      id: classId,
      label: 'Class',
      properties: {
        name: symbol,
        filePath,
      },
    });

    graph.addRelationship({
      id: generateId('DEFINES', `${fileId}->${classId}`),
      type: 'DEFINES',
      sourceId: fileId,
      targetId: classId,
      confidence: 1.0,
      reason: '',
    });
  }

  const result = await processUnityResources(graph, { repoPath: fixtureRoot });
  const unityFileRelations = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_COMPONENT_IN');
  const unityComponentInstanceRelations = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_COMPONENT_INSTANCE');
  const unitySummaryRelations = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_RESOURCE_SUMMARY');
  const syntheticResourceFiles = [...graph.iterNodes()].filter(
    (node) => node.label === 'File' && /\.(prefab|unity|asset)$/.test(String(node.properties.filePath)),
  );
  const componentNodes = [...graph.iterNodes()].filter((node) => node.label === 'CodeElement');

  assert.equal(result.bindingCount > 0, true);
  assert.equal(unityFileRelations.length, 0);
  assert.ok(unityComponentInstanceRelations.length > 0);
  assert.ok(syntheticResourceFiles.length > 0);
  assert.ok(unitySummaryRelations.length > 0);
  assert.equal(componentNodes.length, 0);
  assert.ok(result.bindingCount >= symbols.length);
  assert.equal(result.paritySeed?.version, 1);
  assert.ok((result.paritySeed?.scriptPathToGuid || {})['Assets/Scripts/MainUIManager.cs']);
  assert.ok(result.timingsMs.scanContext >= 0);
  assert.ok(result.timingsMs.resolve >= 0);
  assert.ok(result.timingsMs.graphWrite > 0);
});

test('fixture run emits scene->prefab UNITY_ASSET_GUID_REF and keeps script ref edges', async () => {
  const graph = createKnowledgeGraph();
  for (const symbol of symbols) {
    const filePath = `Assets/Scripts/${symbol}.cs`;
    const fileId = generateId('File', filePath);
    const classId = generateId('Class', `${filePath}:${symbol}`);

    graph.addNode({
      id: fileId,
      label: 'File',
      properties: {
        name: `${symbol}.cs`,
        filePath,
      },
    });

    graph.addNode({
      id: classId,
      label: 'Class',
      properties: {
        name: symbol,
        filePath,
      },
    });

    graph.addRelationship({
      id: generateId('DEFINES', `${fileId}->${classId}`),
      type: 'DEFINES',
      sourceId: fileId,
      targetId: classId,
      confidence: 1.0,
      reason: '',
    });
  }

  await processUnityResources(graph, { repoPath: fixtureRoot });

  const guidRefs = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_ASSET_GUID_REF');
  const scenePrefabRef = guidRefs.find((rel) => {
    const reason = JSON.parse(String(rel.reason || '{}'));
    return (
      reason.resourcePath === 'Assets/Scene/MainUIManager.unity'
      && reason.targetResourcePath === 'Assets/Prefabs/BattleMode.prefab'
      && reason.fieldName === 'm_SourcePrefab'
    );
  });
  assert.ok(scenePrefabRef);
  const scriptRefs = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_GRAPH_NODE_SCRIPT_REF');
  assert.ok(scriptRefs.length > 0);
});

test('large prefab retains ordinary GUID fields without duplicating prefab-source references', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-large-guid-'));
  const scriptPath = 'Assets/Scripts/Carrier.cs';
  const targetPath = 'Assets/Data/Poison.asset';
  const sourcePrefabPath = 'Assets/Prefabs/Source.prefab';
  const scriptGuid = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const targetGuid = 'dd558a5720d6b394687c2c230446ab7c';
  const sourceGuid = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const resourcePaths = ['Assets/Prefabs/Small.prefab', 'Assets/Prefabs/Large.prefab'];

  try {
    for (const relative of [scriptPath, targetPath, sourcePrefabPath, ...resourcePaths]) {
      await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    }
    await fs.writeFile(path.join(root, scriptPath), 'public class Carrier {}');
    await fs.writeFile(path.join(root, `${scriptPath}.meta`), `guid: ${scriptGuid}\n`);
    await fs.writeFile(path.join(root, targetPath), '%YAML 1.1\n');
    await fs.writeFile(path.join(root, `${targetPath}.meta`), `guid: ${targetGuid}\n`);
    await fs.writeFile(path.join(root, sourcePrefabPath), '%YAML 1.1\n');
    await fs.writeFile(path.join(root, `${sourcePrefabPath}.meta`), `guid: ${sourceGuid}\n`);
    const content = (padding: string) => [
      '--- !u!114 &100', 'MonoBehaviour:',
      `  m_Script: {fileID: 11500000, guid: ${scriptGuid}, type: 3}`,
      `  element: {fileID: 11400000, guid: ${targetGuid}, type: 2}`,
      '--- !u!1001 &200', 'PrefabInstance:',
      `  m_SourcePrefab: {fileID: 100100000, guid: ${sourceGuid}, type: 3}`,
      '--- !u!114 &300', 'MonoBehaviour:',
      '  m_Script: {fileID: 11500000, guid: cccccccccccccccccccccccccccccccc, type: 3}',
      `  wrongTarget: {fileID: 11400000, guid: ${targetGuid}, type: 2}`,
      padding,
    ].join('\n');
    await fs.writeFile(path.join(root, resourcePaths[0]), content(''));
    await fs.writeFile(path.join(root, resourcePaths[1]), content(`#${'x'.repeat(600 * 1024)}`));

    const graph = createKnowledgeGraph();
    const fileId = generateId('File', scriptPath);
    const classId = generateId('Class', `${scriptPath}:Carrier`);
    graph.addNode({ id: fileId, label: 'File', properties: { name: 'Carrier.cs', filePath: scriptPath } });
    graph.addNode({ id: classId, label: 'Class', properties: { name: 'Carrier', filePath: scriptPath } });
    graph.addRelationship({ id: generateId('DEFINES', `${fileId}->${classId}`), type: 'DEFINES', sourceId: fileId, targetId: classId, confidence: 1, reason: '' });

    const result = await processUnityResources(graph, { repoPath: root });
    const refs = [...graph.iterRelationships()]
      .filter((rel) => rel.type === 'UNITY_ASSET_GUID_REF')
      .map((rel) => JSON.parse(String(rel.reason || '{}')));
    assert.equal(result.bindingCount, 2);
    assert.deepEqual(refs.filter((ref) => ref.fieldName === 'element').map((ref) => ref.resourcePath).sort(), [...resourcePaths].sort());
    assert.equal(refs.filter((ref) => ref.fieldName === 'm_SourcePrefab').length, 2);
    assert.equal(refs.filter((ref) => ref.fieldName === 'wrongTarget').length, 0);
    assert.ok(refs.filter((ref) => ref.fieldName === 'element').every((ref) => ref.targetResourcePath === targetPath));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('processUnityResources persists UNITY_RESOURCE_SUMMARY in LadybugDB', async () => {
  const graph = createKnowledgeGraph();

  for (const symbol of symbols) {
    const filePath = `Assets/Scripts/${symbol}.cs`;
    const fileId = generateId('File', filePath);
    const classId = generateId('Class', `${filePath}:${symbol}`);

    graph.addNode({
      id: fileId,
      label: 'File',
      properties: {
        name: `${symbol}.cs`,
        filePath,
      },
    });

    graph.addNode({
      id: classId,
      label: 'Class',
      properties: {
        name: symbol,
        filePath,
      },
    });

    graph.addRelationship({
      id: generateId('DEFINES', `${fileId}->${classId}`),
      type: 'DEFINES',
      sourceId: fileId,
      targetId: classId,
      confidence: 1.0,
      reason: '',
    });
  }

  for (const relPath of await listRelativeFixtureFiles(fixtureRoot)) {
    const normalized = relPath.replace(/\\/g, '/');
    graph.addNode({
      id: generateId('File', normalized),
      label: 'File',
      properties: {
        name: path.basename(normalized),
        filePath: normalized,
      },
    });
  }

  await processUnityResources(graph, { repoPath: fixtureRoot });

  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-resource-summary-'));
  const dbPath = path.join(storageDir, 'graph.lbug');

  try {
    await initLbug(dbPath);
    await loadGraphToLbug(graph, fixtureRoot, storageDir);
    const rows = await executeQuery(
      `MATCH (c:Class)-[r:CodeRelation {type:'UNITY_RESOURCE_SUMMARY'}]->(f:File)
       RETURN count(r) AS cnt`,
    );
    assert.ok((rows?.[0]?.cnt ?? 0) > 0, 'UNITY_RESOURCE_SUMMARY must persist in LadybugDB');
  } finally {
    await closeLbug();
    await fs.rm(storageDir, { recursive: true, force: true });
  }
});

test('processUnityResources builds scan context once and enriches all class nodes', async () => {
  const graph = createKnowledgeGraph();

  for (const symbol of symbols) {
    const filePath = `Assets/Scripts/${symbol}.cs`;
    const fileId = generateId('File', filePath);
    const classId = generateId('Class', `${filePath}:${symbol}`);

    graph.addNode({
      id: fileId,
      label: 'File',
      properties: {
        name: `${symbol}.cs`,
        filePath,
      },
    });

    graph.addNode({
      id: classId,
      label: 'Class',
      properties: {
        name: symbol,
        filePath,
      },
    });
  }

  const result = await processUnityResources(graph, {
    repoPath: fixtureRoot,
    scopedPaths: ['Assets/Scripts/MainUIManager.cs', 'Assets/Scene/MainUIManager.unity'],
  });

  assert.ok(result.processedSymbols > 0);
  assert.ok(result.bindingCount > 0);
});

test('processUnityResources skips resolve for symbols without guid resource hits in scan context', async () => {
  const graph = createKnowledgeGraph();
  for (const symbol of ['HitSymbol', 'MissSymbol']) {
    const filePath = `Assets/Scripts/${symbol}.cs`;
    const classId = generateId('Class', `${filePath}:${symbol}`);
    graph.addNode({
      id: classId,
      label: 'Class',
      properties: {
        name: symbol,
        filePath,
      },
    });
  }

  const calledSymbols: string[] = [];
  const fakeScanContext = {
    symbolToScriptPath: new Map([
      ['HitSymbol', 'Assets/Scripts/HitSymbol.cs'],
      ['MissSymbol', 'Assets/Scripts/MissSymbol.cs'],
    ]),
    scriptPathToGuid: new Map([
      ['Assets/Scripts/HitSymbol.cs', '11111111111111111111111111111111'],
      ['Assets/Scripts/MissSymbol.cs', '22222222222222222222222222222222'],
    ]),
    guidToResourceHits: new Map([
      ['11111111111111111111111111111111', [{ resourcePath: 'Assets/Scene/Test.unity', resourceType: 'scene', line: 1, lineText: 'guid: 1111' }]],
      ['22222222222222222222222222222222', []],
    ]),
    resourceDocCache: new Map(),
  };

  const result = await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async () => fakeScanContext as any,
      resolveBindings: async ({ symbol }) => {
        calledSymbols.push(String(symbol));
        if (symbol === 'HitSymbol') {
          return {
            symbol: 'HitSymbol',
            scriptPath: 'Assets/Scripts/HitSymbol.cs',
            scriptGuid: '11111111111111111111111111111111',
            resourceBindings: [
              {
                resourcePath: 'Assets/Scene/Test.unity',
                resourceType: 'scene',
                bindingKind: 'direct',
                componentObjectId: '11400000',
                evidence: { line: 1, lineText: 'guid: 1111' },
                serializedFields: { scalarFields: [], referenceFields: [] },
              },
            ],
            serializedFields: { scalarFields: [], referenceFields: [] },
            unityDiagnostics: [],
          } as any;
        }

        return {
          symbol: String(symbol),
          scriptPath: '',
          scriptGuid: '',
          resourceBindings: [],
          serializedFields: { scalarFields: [], referenceFields: [] },
          unityDiagnostics: [],
        } as any;
      },
    },
  );

  assert.deepEqual(calledSymbols, ['HitSymbol']);
  assert.equal(result.processedSymbols, 1);
  assert.equal(result.bindingCount, 1);
});

test('processUnityResources skips resolve for symbols missing canonical script mapping', async () => {
  const graph = createKnowledgeGraph();
  for (const symbol of ['HitSymbol', 'UnknownSymbol']) {
    const filePath = `Assets/Scripts/${symbol}.cs`;
    const classId = generateId('Class', `${filePath}:${symbol}`);
    graph.addNode({
      id: classId,
      label: 'Class',
      properties: {
        name: symbol,
        filePath,
      },
    });
  }

  const calledSymbols: string[] = [];
  const fakeScanContext = {
    symbolToScriptPath: new Map([['HitSymbol', 'Assets/Scripts/HitSymbol.cs']]),
    scriptPathToGuid: new Map([['Assets/Scripts/HitSymbol.cs', '11111111111111111111111111111111']]),
    guidToResourceHits: new Map([
      ['11111111111111111111111111111111', [{ resourcePath: 'Assets/Scene/Test.unity', resourceType: 'scene', line: 1, lineText: 'guid: 1111' }]],
    ]),
    resourceDocCache: new Map(),
  };

  const result = await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async () => fakeScanContext as any,
      resolveBindings: async ({ symbol }) => {
        calledSymbols.push(String(symbol));
        return {
          symbol: String(symbol),
          scriptPath: 'Assets/Scripts/HitSymbol.cs',
          scriptGuid: '11111111111111111111111111111111',
          resourceBindings: [
            {
              resourcePath: 'Assets/Scene/Test.unity',
              resourceType: 'scene',
              bindingKind: 'direct',
              componentObjectId: '11400000',
              evidence: { line: 1, lineText: 'guid: 1111' },
              serializedFields: { scalarFields: [], referenceFields: [] },
            },
          ],
          serializedFields: { scalarFields: [], referenceFields: [] },
          unityDiagnostics: [],
        } as any;
      },
    },
  );

  assert.deepEqual(calledSymbols, ['HitSymbol']);
  assert.ok(result.diagnostics.some((line) => line.includes('missing canonical script mapping')));
});

test('processUnityResources memoizes resolve results by symbol within one run', async () => {
  const graph = createKnowledgeGraph();
  for (const filePath of ['Assets/Scripts/DupA.cs', 'Assets/Scripts/DupB.cs']) {
    const classId = generateId('Class', `${filePath}:DupSymbol`);
    graph.addNode({
      id: classId,
      label: 'Class',
      properties: {
        name: 'DupSymbol',
        filePath,
      },
    });
  }

  const calledSymbols: string[] = [];
  const fakeScanContext = {
    symbolToScriptPath: new Map([['DupSymbol', 'Assets/Scripts/DupA.cs']]),
    scriptPathToGuid: new Map([['Assets/Scripts/DupA.cs', '11111111111111111111111111111111']]),
    guidToResourceHits: new Map([
      ['11111111111111111111111111111111', [{ resourcePath: 'Assets/Scene/Test.unity', resourceType: 'scene', line: 1, lineText: 'guid: 1111' }]],
    ]),
    resourceDocCache: new Map(),
  };

  const result = await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async () => fakeScanContext as any,
      resolveBindings: async ({ symbol }) => {
        calledSymbols.push(String(symbol));
        return {
          symbol: String(symbol),
          scriptPath: 'Assets/Scripts/DupA.cs',
          scriptGuid: '11111111111111111111111111111111',
          resourceBindings: [
            {
              resourcePath: 'Assets/Scene/Test.unity',
              resourceType: 'scene',
              bindingKind: 'direct',
              componentObjectId: '11400000',
              evidence: { line: 1, lineText: 'guid: 1111' },
              serializedFields: { scalarFields: [], referenceFields: [] },
            },
          ],
          serializedFields: { scalarFields: [], referenceFields: [] },
          unityDiagnostics: [],
        } as any;
      },
    },
  );

  assert.deepEqual(calledSymbols, ['DupSymbol']);
  assert.equal(result.processedSymbols, 1);
  assert.equal(result.bindingCount, 1);
  assert.ok(result.diagnostics.some((line) => line.includes('skip-non-canonical=1')));
});

test('processUnityResources writes UNITY_RESOURCE_SUMMARY only for canonical class node', async () => {
  const graph = createKnowledgeGraph();
  const canonicalPath = 'Assets/Scripts/PlayerActor.cs';
  const partialPath = 'Assets/Scripts/PlayerActor.Visual.cs';
  const canonicalClassId = generateId('Class', `${canonicalPath}:PlayerActor`);
  const partialClassId = generateId('Class', `${partialPath}:PlayerActor`);
  graph.addNode({
    id: canonicalClassId,
    label: 'Class',
    properties: { name: 'PlayerActor', filePath: canonicalPath },
  });
  graph.addNode({
    id: partialClassId,
    label: 'Class',
    properties: { name: 'PlayerActor', filePath: partialPath },
  });

  const fakeScanContext = {
    symbolToScriptPath: new Map([['PlayerActor', canonicalPath]]),
    symbolToScriptPaths: new Map([['PlayerActor', [canonicalPath, partialPath]]]),
    symbolToCanonicalScriptPath: new Map([['PlayerActor', canonicalPath]]),
    scriptPathToGuid: new Map([[canonicalPath, '11111111111111111111111111111111']]),
    guidToResourceHits: new Map([
      ['11111111111111111111111111111111', [{ resourcePath: 'Assets/Scene/Test.unity', resourceType: 'scene', line: 1, lineText: 'guid: 1111' }]],
    ]),
    resourceDocCache: new Map(),
  };

  const result = await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async () => fakeScanContext as any,
      resolveBindings: async () =>
        ({
          symbol: 'PlayerActor',
          scriptPath: canonicalPath,
          scriptGuid: '11111111111111111111111111111111',
          resourceBindings: [
            {
              resourcePath: 'Assets/Scene/Test.unity',
              resourceType: 'scene',
              bindingKind: 'direct',
              componentObjectId: '11400000',
              evidence: { line: 1, lineText: 'guid: 1111' },
              serializedFields: { scalarFields: [], referenceFields: [] },
            },
          ],
          serializedFields: { scalarFields: [], referenceFields: [] },
          unityDiagnostics: [],
        }) as any,
    },
  );

  const summaryRelations = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_RESOURCE_SUMMARY');
  assert.equal(summaryRelations.length, 1);
  assert.equal(summaryRelations[0]?.sourceId, canonicalClassId);
  assert.equal(result.processedSymbols, 1);
  assert.equal(result.bindingCount, 1);
  assert.ok(result.diagnostics.some((line) => line.includes('selected=1')));
  assert.ok(result.diagnostics.some((line) => line.includes('skip-non-canonical=1')));
});

test('processUnityResources writes UNITY_RESOURCE_SUMMARY for serializable class field matches', async () => {
  const graph = createKnowledgeGraph();
  const hostPath = 'Assets/Scripts/HostClass.cs';
  const serializablePath = 'Assets/Scripts/AssetRef.cs';
  const hostClassId = generateId('Class', `${hostPath}:HostClass`);
  const serializableClassId = generateId('Class', `${serializablePath}:AssetRef`);
  graph.addNode({
    id: hostClassId,
    label: 'Class',
    properties: { name: 'HostClass', filePath: hostPath },
  });
  graph.addNode({
    id: serializableClassId,
    label: 'Class',
    properties: { name: 'AssetRef', filePath: serializablePath },
  });

  const fakeScanContext = {
    symbolToScriptPath: new Map([
      ['HostClass', hostPath],
      ['AssetRef', serializablePath],
    ]),
    symbolToScriptPaths: new Map([
      ['HostClass', [hostPath]],
      ['AssetRef', [serializablePath]],
    ]),
    symbolToCanonicalScriptPath: new Map([
      ['HostClass', hostPath],
      ['AssetRef', serializablePath],
    ]),
    scriptPathToGuid: new Map([[hostPath, '11111111111111111111111111111111']]),
    guidToResourceHits: new Map([
      ['11111111111111111111111111111111', [{ resourcePath: 'Assets/Scene/Test.unity', resourceType: 'scene', line: 3, lineText: 'guid: 1111' }]],
    ]),
    serializableSymbols: new Set(['AssetRef']),
    hostFieldTypeHints: new Map([['HostClass', new Map([['assetRef', 'AssetRef']])]]),
    resourceDocCache: new Map(),
  };

  await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async () => fakeScanContext as any,
      resolveBindings: async () =>
        ({
          symbol: 'HostClass',
          scriptPath: hostPath,
          scriptGuid: '11111111111111111111111111111111',
          resourceBindings: [
            {
              resourcePath: 'Assets/Scene/Test.unity',
              resourceType: 'scene',
              bindingKind: 'direct',
              componentObjectId: '11400000',
              evidence: { line: 3, lineText: 'guid: 1111' },
              serializedFields: {
                scalarFields: [],
                referenceFields: [
                  { name: 'assetRef', guid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', fileId: '0', sourceLayer: 'scene' },
                ],
              },
            },
          ],
          serializedFields: { scalarFields: [], referenceFields: [] },
          unityDiagnostics: [],
        }) as any,
    },
  );

  const summaryRelations = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_RESOURCE_SUMMARY');
  const serializableSummary = summaryRelations.filter((rel) => rel.sourceId === serializableClassId);
  assert.equal(serializableSummary.length, 1);
  const serializedTypeRelations = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_SERIALIZED_TYPE_IN');
  assert.equal(serializedTypeRelations.length, 1);
  const reason = JSON.parse(String(serializedTypeRelations[0]?.reason || '{}'));
  assert.equal(reason.fieldName, 'assetRef');
  assert.equal(reason.declaredType, 'AssetRef');
  assert.equal(reason.hostSymbol, 'HostClass');
});

test('processUnityResources writes asset-guid and graph-node reference edges from resolved references', async () => {
  const graph = createKnowledgeGraph();
  const hostPath = 'Assets/Scripts/WeaponConfig.cs';
  const classId = generateId('Class', `${hostPath}:WeaponConfig`);
  graph.addNode({
    id: classId,
    label: 'Class',
    properties: { name: 'WeaponConfig', filePath: hostPath },
  });

  const fakeScanContext = {
    symbolToScriptPath: new Map([['WeaponConfig', hostPath]]),
    scriptPathToGuid: new Map([[hostPath, '11111111111111111111111111111111']]),
    guidToResourceHits: new Map([
      ['11111111111111111111111111111111', [{ resourcePath: 'Assets/Data/WeaponConfig.asset', resourceType: 'asset', line: 3, lineText: 'guid: 1111' }]],
    ]),
    resourceDocCache: new Map(),
  };

  await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async () => fakeScanContext as any,
      resolveBindings: async () =>
        ({
          symbol: 'WeaponConfig',
          scriptPath: hostPath,
          scriptGuid: '11111111111111111111111111111111',
          resourceBindings: [
            {
              resourcePath: 'Assets/Data/WeaponConfig.asset',
              resourceType: 'asset',
              bindingKind: 'direct',
              componentObjectId: '11400000',
              evidence: { line: 3, lineText: 'guid: 1111' },
              serializedFields: { scalarFields: [], referenceFields: [] },
              resolvedReferences: [
                {
                  fieldName: 'gungraph',
                  sourceLayer: 'asset',
                  fileId: '11400000',
                  guid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                  fromList: false,
                  resolution: 'external-asset',
                  target: { assetPath: 'Assets/Graphs/Weapon.asset' },
                },
              ],
            },
          ],
          serializedFields: { scalarFields: [], referenceFields: [] },
          unityDiagnostics: [],
        }) as any,
    },
  );

  const graphNodeRefs = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_GRAPH_NODE_SCRIPT_REF');
  const guidRefs = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_ASSET_GUID_REF');
  assert.equal(graphNodeRefs.length, 1);
  assert.equal(guidRefs.length, 1);
  const guidReason = JSON.parse(String(guidRefs[0]?.reason || '{}'));
  assert.equal(guidReason.guid, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(guidReason.targetResourcePath, 'Assets/Graphs/Weapon.asset');
  assert.equal(guidReason.fieldName, 'gungraph');
});

test('processUnityResources emits prefab-source edges from scanContext.prefabSourceRefs only', async () => {
  const graph = createKnowledgeGraph();
  const fakeScanContext = {
    symbolToScriptPath: new Map<string, string>(),
    scriptPathToGuid: new Map<string, string>(),
    guidToResourceHits: new Map<string, any[]>(),
    prefabSourceRefs: [
      {
        sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
        targetGuid: '99999999999999999999999999999999',
        targetResourcePath: 'Assets/Prefabs/BattleMode.prefab',
        fileId: '100100000',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'scene',
      },
    ],
    resourceDocCache: new Map(),
  };

  const result = await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async () => fakeScanContext as any,
      resolveBindings: async () => ({ resourceBindings: [], unityDiagnostics: [] }) as any,
    },
  );

  const guidRefs = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_ASSET_GUID_REF');
  assert.equal(guidRefs.length, 1);
  const reason = JSON.parse(String(guidRefs[0]?.reason || '{}'));
  assert.equal(reason.fieldName, 'm_SourcePrefab');
  assert.equal(reason.sourceLayer, 'scene');
  assert.ok(result.diagnostics.some((line) => line.includes('prefab-source: emitted=1')));
});

test('processUnityResources consumes prefab-source stream incrementally and emits edges', async () => {
  const graph = createKnowledgeGraph();
  const fakeScanContext = {
    symbolToScriptPath: new Map<string, string>(),
    scriptPathToGuid: new Map<string, string>(),
    guidToResourceHits: new Map<string, any[]>(),
    assetGuidToPath: new Map([['99999999999999999999999999999999', 'Assets/Prefabs/BattleMode.prefab']]),
    streamPrefabSourceRefs: async function* () {
      yield {
        sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
        targetGuid: '99999999999999999999999999999999',
        targetResourcePath: 'Assets/Prefabs/BattleMode.prefab',
        fileId: '100100000',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'scene',
      };
      await new Promise((resolve) => setTimeout(resolve, 1));
      yield {
        sourceResourcePath: 'Assets/Scene/Global.unity',
        targetGuid: '99999999999999999999999999999999',
        targetResourcePath: 'Assets/Prefabs/BattleMode.prefab',
        fileId: '100100001',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'scene',
      };
    },
    prefabSourceRefs: [],
    resourceDocCache: new Map(),
  } as any;

  const result = await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async () => fakeScanContext,
      resolveBindings: async () => ({ resourceBindings: [], unityDiagnostics: [] }) as any,
    },
  );

  assert.ok(result.diagnostics.some((line) => line.includes('prefab-source: emitted=2')));
  assert.ok(result.diagnostics.some((line) => line.includes('prefab_source.rows_emitted=2')));
  assert.ok(result.diagnostics.some((line) => line.includes('prefab_source.rows_parsed=')));
});

test('prefab-source accounting invariant closes', async () => {
  const graph = createKnowledgeGraph();
  const fakeScanContext = {
    symbolToScriptPath: new Map<string, string>(),
    scriptPathToGuid: new Map<string, string>(),
    guidToResourceHits: new Map<string, any[]>(),
    assetGuidToPath: new Map([['99999999999999999999999999999999', 'Assets/Prefabs/BattleMode.prefab']]),
    streamPrefabSourceRefs: async function* () {
      yield {
        sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
        targetGuid: '99999999999999999999999999999999',
        targetResourcePath: 'Assets/Prefabs/BattleMode.prefab',
        fileId: '100100000',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'scene',
      };
      yield {
        sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
        targetGuid: '00000000000000000000000000000000',
        targetResourcePath: 'Assets/Prefabs/BattleMode.prefab',
        fileId: '100100001',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'scene',
      };
      yield {
        sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
        targetGuid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        targetResourcePath: '__PLACEHOLDER__',
        fileId: '100100002',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'scene',
      };
      yield {
        sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
        targetGuid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        targetResourcePath: '',
        fileId: '100100003',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'scene',
      };
      yield {
        sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
        targetGuid: '99999999999999999999999999999999',
        targetResourcePath: 'Assets/Prefabs/BattleMode.prefab',
        fileId: '100100000',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'scene',
      };
    },
    prefabSourceRefs: [],
    resourceDocCache: new Map(),
  } as any;

  const result = await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async () => fakeScanContext,
      resolveBindings: async () => ({ resourceBindings: [], unityDiagnostics: [] }) as any,
    },
  );
  assert.equal(
    (result as any).prefabSourceStats.rowsParsed,
    (result as any).prefabSourceStats.rowsFilteredZeroGuid
      + (result as any).prefabSourceStats.rowsFilteredPlaceholder
      + (result as any).prefabSourceStats.rowsFilteredUnresolved
      + (result as any).prefabSourceStats.rowsDeduped
      + (result as any).prefabSourceStats.rowsEmitted,
  );
});

test('no cross-signal dedupe collision when same source has script-guid and prefab-source refs', async () => {
  const graph = createKnowledgeGraph();
  const filePath = 'Assets/Scripts/MainUIManager.cs';
  const classId = generateId('Class', `${filePath}:MainUIManager`);
  graph.addNode({
    id: classId,
    label: 'Class',
    properties: { name: 'MainUIManager', filePath },
  });

  const fakeScanContext = {
    symbolToScriptPath: new Map([['MainUIManager', filePath]]),
    scriptPathToGuid: new Map([[filePath, 'dddddddddddddddddddddddddddddddd']]),
    guidToResourceHits: new Map([
      ['dddddddddddddddddddddddddddddddd', [{ resourcePath: 'Assets/Scene/MainUIManager.unity', resourceType: 'scene', line: 1, lineText: 'guid' }]],
    ]),
    assetGuidToPath: new Map([['99999999999999999999999999999999', 'Assets/Prefabs/BattleMode.prefab']]),
    streamPrefabSourceRefs: async function* () {
      yield {
        sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
        targetGuid: '99999999999999999999999999999999',
        targetResourcePath: 'Assets/Prefabs/BattleMode.prefab',
        fileId: '100100000',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'scene',
      };
    },
    prefabSourceRefs: [],
    resourceDocCache: new Map(),
  } as any;

  await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async () => fakeScanContext,
      resolveBindings: async () =>
        ({
          symbol: 'MainUIManager',
          scriptPath: filePath,
          scriptGuid: 'dddddddddddddddddddddddddddddddd',
          resourceBindings: [
            {
              resourcePath: 'Assets/Scene/MainUIManager.unity',
              resourceType: 'scene',
              bindingKind: 'direct',
              componentObjectId: '11400000',
              evidence: { line: 1, lineText: 'guid' },
              serializedFields: { scalarFields: [], referenceFields: [] },
              resolvedReferences: [
                {
                  fieldName: 'gungraph',
                  sourceLayer: 'scene',
                  fileId: '11400000',
                  guid: '99999999999999999999999999999999',
                  fromList: false,
                  resolution: 'external-asset',
                  target: { assetPath: 'Assets/Prefabs/BattleMode.prefab' },
                },
              ],
            },
          ],
          serializedFields: { scalarFields: [], referenceFields: [] },
          unityDiagnostics: [],
        }) as any,
    },
  );

  const refs = [...graph.iterRelationships()]
    .filter((rel) => rel.type === 'UNITY_ASSET_GUID_REF')
    .map((rel) => JSON.parse(String(rel.reason || '{}')));
  assert.ok(refs.some((reason) => reason.fieldName === 'm_SourcePrefab'));
  assert.ok(refs.some((reason) => reason.fieldName === 'gungraph'));
});

test('scan-context does not write graph edges directly; processor remains sole writer', async () => {
  const graph = createKnowledgeGraph();
  const context = await buildUnityScanContext({ repoRoot: fixtureRoot });
  assert.equal([...graph.iterRelationships()].length, 0);
  await processUnityResources(graph, { repoPath: fixtureRoot }, {
    buildScanContext: async () => context as any,
    resolveBindings: async () => ({ resourceBindings: [], unityDiagnostics: [] }) as any,
  });
  assert.ok([...graph.iterRelationships()].some((rel) => rel.type === 'UNITY_ASSET_GUID_REF'));
});

test('prefab source pass can be disabled via env toggle', async () => {
  const graph = createKnowledgeGraph();
  const fakeScanContext = {
    symbolToScriptPath: new Map<string, string>(),
    scriptPathToGuid: new Map<string, string>(),
    guidToResourceHits: new Map<string, any[]>(),
    prefabSourceRefs: [
      {
        sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
        targetGuid: '99999999999999999999999999999999',
        targetResourcePath: 'Assets/Prefabs/BattleMode.prefab',
        fileId: '100100000',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'scene',
      },
    ],
    resourceDocCache: new Map(),
  };

  const originalValue = process.env.GITNEXUS_DISABLE_PREFAB_SOURCE_PASS;
  process.env.GITNEXUS_DISABLE_PREFAB_SOURCE_PASS = '1';
  try {
    const result = await processUnityResources(
      graph,
      { repoPath: fixtureRoot },
      {
        buildScanContext: async () => fakeScanContext as any,
        resolveBindings: async () => ({ resourceBindings: [], unityDiagnostics: [] }) as any,
      },
    );
    const guidRefs = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_ASSET_GUID_REF');
    assert.equal(guidRefs.length, 0);
    assert.ok(result.diagnostics.some((line) => line.includes('prefab-source: skipped')));
  } finally {
    if (typeof originalValue === 'undefined') {
      delete process.env.GITNEXUS_DISABLE_PREFAB_SOURCE_PASS;
    } else {
      process.env.GITNEXUS_DISABLE_PREFAB_SOURCE_PASS = originalValue;
    }
  }
});

test('prefab nested source dedupes duplicate PrefabInstance rows', async () => {
  const graph = createKnowledgeGraph();
  const fakeScanContext = {
    symbolToScriptPath: new Map<string, string>(),
    scriptPathToGuid: new Map<string, string>(),
    guidToResourceHits: new Map<string, any[]>(),
    prefabSourceRefs: [
      {
        sourceResourcePath: 'Assets/Prefabs/BattleMode.prefab',
        targetGuid: '99999999999999999999999999999999',
        targetResourcePath: 'Assets/Prefabs/Nested.prefab',
        fileId: '100100000',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'prefab',
      },
      {
        sourceResourcePath: 'Assets/Prefabs/BattleMode.prefab',
        targetGuid: '99999999999999999999999999999999',
        targetResourcePath: 'Assets/Prefabs/Nested.prefab',
        fileId: '100100000',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'prefab',
      },
    ],
    resourceDocCache: new Map(),
  };

  await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async () => fakeScanContext as any,
      resolveBindings: async () => ({ resourceBindings: [], unityDiagnostics: [] }) as any,
    },
  );

  const guidRefs = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_ASSET_GUID_REF');
  assert.equal(guidRefs.length, 1);
  const reason = JSON.parse(String(guidRefs[0]?.reason || '{}'));
  assert.equal(reason.guid, '99999999999999999999999999999999');
});

test('drops placeholder unresolved and zero-guid prefab-source rows and reports filtered counters', async () => {
  const graph = createKnowledgeGraph();
  const fakeScanContext = {
    symbolToScriptPath: new Map<string, string>(),
    scriptPathToGuid: new Map<string, string>(),
    guidToResourceHits: new Map<string, any[]>(),
    prefabSourceRefs: [
      {
        sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
        targetGuid: '00000000000000000000000000000000',
        targetResourcePath: 'Assets/Prefabs/BattleMode.prefab',
        fileId: '1',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'scene',
      },
      {
        sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
        targetGuid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        targetResourcePath: '__PLACEHOLDER__',
        fileId: '2',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'scene',
      },
      {
        sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
        targetGuid: 'cccccccccccccccccccccccccccccccc',
        targetResourcePath: '',
        fileId: '3',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'scene',
      },
      {
        sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
        targetGuid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        targetResourcePath: 'Assets/Prefabs/BattleMode.prefab',
        fileId: '4',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'scene',
      },
    ],
    resourceDocCache: new Map(),
  };

  const result = await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async () => fakeScanContext as any,
      resolveBindings: async () => ({ resourceBindings: [], unityDiagnostics: [] }) as any,
    },
  );

  const guidRefs = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_ASSET_GUID_REF');
  assert.equal(guidRefs.length, 1);
  const reason = JSON.parse(String(guidRefs[0]?.reason || '{}'));
  assert.equal(reason.targetResourcePath, 'Assets/Prefabs/BattleMode.prefab');
  assert.notEqual(reason.guid, '00000000000000000000000000000000');
  assert.ok((result as any).prefabSourceStats.rowsFilteredZeroGuid > 0);
  assert.ok((result as any).prefabSourceStats.rowsFilteredPlaceholder > 0);
  assert.ok((result as any).prefabSourceStats.rowsFilteredUnresolved > 0);
  assert.ok(result.diagnostics.some((line) => line.includes('prefab_source.rows_filtered_zero_guid=')));
  assert.ok(result.diagnostics.some((line) => line.includes('prefab_source.rows_filtered_placeholder=')));
  assert.ok(result.diagnostics.some((line) => line.includes('prefab_source.rows_filtered_unresolved=')));
});

test('per-file scan failure is isolated and does not abort subsequent file emission', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-prefab-source-file-error-'));
  const graph = createKnowledgeGraph();
  try {
    const sceneDir = path.join(tempRoot, 'Assets/Scene');
    const prefabDir = path.join(tempRoot, 'Assets/Prefabs');
    await fs.mkdir(path.join(sceneDir, 'Broken.unity'), { recursive: true });
    await fs.mkdir(prefabDir, { recursive: true });
    await fs.writeFile(
      path.join(sceneDir, 'Good.unity'),
      [
        '--- !u!1001 &100100000',
        'PrefabInstance:',
        '  m_SourcePrefab: {fileID: 100100000, guid: 99999999999999999999999999999999, type: 3}',
      ].join('\n'),
      'utf-8',
    );
    await fs.writeFile(path.join(prefabDir, 'BattleMode.prefab'), '--- !u!1 &1\nGameObject:\n', 'utf-8');

    const fakeScanContext = {
      symbolToScriptPath: new Map<string, string>(),
      scriptPathToGuid: new Map<string, string>(),
      guidToResourceHits: new Map<string, any[]>(),
      assetGuidToPath: new Map([['99999999999999999999999999999999', 'Assets/Prefabs/BattleMode.prefab']]),
      streamPrefabSourceRefs: (options?: any) => streamPrefabSourceRefs({
        repoRoot: tempRoot,
        resourceFiles: ['Assets/Scene/Broken.unity', 'Assets/Scene/Good.unity'],
        assetGuidToPath: new Map([['99999999999999999999999999999999', 'Assets/Prefabs/BattleMode.prefab']]),
        hooks: options?.hooks,
      }),
      prefabSourceRefs: [],
      resourceDocCache: new Map(),
    } as any;

    const result = await processUnityResources(
      graph,
      { repoPath: tempRoot },
      {
        buildScanContext: async () => fakeScanContext,
        resolveBindings: async () => ({ resourceBindings: [], unityDiagnostics: [] }) as any,
      },
    );
    assert.ok((result as any).prefabSourceStats.rowsEmitted > 0);
    assert.ok(result.diagnostics.some((line) => line.includes('prefab_source.file_errors=1')));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('extracts prefab source refs without class binding resolve', async () => {
  const graph = createKnowledgeGraph();
  let resolveBindingsCallCount = 0;
  const fakeScanContext = {
    symbolToScriptPath: new Map<string, string>(),
    scriptPathToGuid: new Map<string, string>(),
    guidToResourceHits: new Map<string, any[]>(),
    prefabSourceRefs: [
      {
        sourceResourcePath: 'Assets/Scene/MainUIManager.unity',
        targetGuid: '99999999999999999999999999999999',
        targetResourcePath: 'Assets/Prefabs/BattleMode.prefab',
        fileId: '100100000',
        fieldName: 'm_SourcePrefab',
        sourceLayer: 'scene',
      },
    ],
    resourceDocCache: new Map(),
  };

  await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async () => fakeScanContext as any,
      resolveBindings: async () => {
        resolveBindingsCallCount += 1;
        return ({ resourceBindings: [], unityDiagnostics: [] }) as any;
      },
    },
  );

  const guidRefs = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_ASSET_GUID_REF');
  assert.equal(resolveBindingsCallCount, 0);
  assert.equal(guidRefs.length, 1);
});

test('processUnityResources writes compact UNITY_RESOURCE_SUMMARY reason by default', async () => {
  const graph = createKnowledgeGraph();
  const classId = generateId('Class', 'Assets/Scripts/Compact.cs:CompactSymbol');
  graph.addNode({
    id: classId,
    label: 'Class',
    properties: { name: 'CompactSymbol', filePath: 'Assets/Scripts/Compact.cs' },
  });

  const fakeScanContext = {
    symbolToScriptPath: new Map([['CompactSymbol', 'Assets/Scripts/Compact.cs']]),
    scriptPathToGuid: new Map([['Assets/Scripts/Compact.cs', '11111111111111111111111111111111']]),
    guidToResourceHits: new Map([
      ['11111111111111111111111111111111', [{ resourcePath: 'Assets/Scene/Test.unity', resourceType: 'scene', line: 9, lineText: 'guid: 1111' }]],
    ]),
    resourceDocCache: new Map(),
  };

  await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async () => fakeScanContext as any,
      resolveBindings: async () =>
        ({
          symbol: 'CompactSymbol',
          scriptPath: 'Assets/Scripts/Compact.cs',
          scriptGuid: '11111111111111111111111111111111',
          resourceBindings: [
            {
              resourcePath: 'Assets/Scene/Test.unity',
              resourceType: 'scene',
              bindingKind: 'scene-override',
              componentObjectId: '11400000',
              evidence: { line: 9, lineText: 'guid: 1111' },
              serializedFields: {
                scalarFields: [{ name: 'needPause', value: '1', valueType: 'number', sourceLayer: 'scene' }],
                referenceFields: [],
              },
            },
          ],
          serializedFields: { scalarFields: [], referenceFields: [] },
          unityDiagnostics: [],
        }) as any,
    },
  );

  const summary = [...graph.iterRelationships()].find((rel) => rel.type === 'UNITY_RESOURCE_SUMMARY');
  assert.ok(summary);
  const reason = JSON.parse(String(summary.reason || '{}'));
  assert.deepEqual(reason.bindingKinds, ['scene-override']);
  assert.equal(reason.lightweight, true);
  assert.equal(reason.resourceType, 'scene');
});

test('processUnityResources keeps UNITY_RESOURCE_SUMMARY reason compact when bindings include assetRefPaths', async () => {
  const graph = createKnowledgeGraph();
  const classId = generateId('Class', 'Assets/Scripts/CharacterList.cs:CharacterList');
  graph.addNode({
    id: classId,
    label: 'Class',
    properties: { name: 'CharacterList', filePath: 'Assets/Scripts/CharacterList.cs' },
  });

  const fakeScanContext = {
    symbolToScriptPath: new Map([['CharacterList', 'Assets/Scripts/CharacterList.cs']]),
    scriptPathToGuid: new Map([['Assets/Scripts/CharacterList.cs', '11111111111111111111111111111111']]),
    guidToResourceHits: new Map([
      ['11111111111111111111111111111111', [{ resourcePath: 'Assets/NEON/DataAssets/CharacterList.asset', resourceType: 'asset', line: 1, lineText: 'guid: 1111' }]],
    ]),
    resourceDocCache: new Map(),
  };

  await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async () => fakeScanContext as any,
      resolveBindings: async () =>
        ({
          symbol: 'CharacterList',
          scriptPath: 'Assets/Scripts/CharacterList.cs',
          scriptGuid: '11111111111111111111111111111111',
          resourceBindings: [
            {
              resourcePath: 'Assets/NEON/DataAssets/CharacterList.asset',
              resourceType: 'asset',
              bindingKind: 'prefab-instance',
              componentObjectId: '11400000',
              evidence: { line: 1, lineText: 'guid: 1111' },
              serializedFields: { scalarFields: [], referenceFields: [] },
              resolvedReferences: [],
              assetRefPaths: [
                {
                  parentFieldName: 'Values',
                  fieldName: '_Head_Ref',
                  relativePath: 'Assets/NEON/Art/Sprites/UI/0_pixle/ui_character_head/hero_head_Nik.png',
                  sourceLayer: 'asset',
                  isEmpty: false,
                  isSprite: true,
                },
              ],
            },
          ],
          serializedFields: { scalarFields: [], referenceFields: [] },
          unityDiagnostics: [],
        }) as any,
    },
  );

  const summary = [...graph.iterRelationships()].find((rel) => rel.type === 'UNITY_RESOURCE_SUMMARY');
  assert.ok(summary);
  assert.equal(String(summary.reason).includes('assetRefPaths'), false);
});

test('processUnityResources summary-only persistence ignores full payload mode and keeps summary reason', async () => {
  const graph = createKnowledgeGraph();
  const classId = generateId('Class', 'Assets/Scripts/Full.cs:FullSymbol');
  graph.addNode({
    id: classId,
    label: 'Class',
    properties: { name: 'FullSymbol', filePath: 'Assets/Scripts/Full.cs' },
  });

  const fakeScanContext = {
    symbolToScriptPath: new Map([['FullSymbol', 'Assets/Scripts/Full.cs']]),
    scriptPathToGuid: new Map([['Assets/Scripts/Full.cs', '11111111111111111111111111111111']]),
    guidToResourceHits: new Map([
      ['11111111111111111111111111111111', [{ resourcePath: 'Assets/Scene/Test.unity', resourceType: 'scene', line: 9, lineText: 'guid: 1111' }]],
    ]),
    resourceDocCache: new Map(),
  };

  await processUnityResources(
    graph,
    { repoPath: fixtureRoot, payloadMode: 'full' } as any,
    {
      buildScanContext: async () => fakeScanContext as any,
      resolveBindings: async () =>
        ({
          symbol: 'FullSymbol',
          scriptPath: 'Assets/Scripts/Full.cs',
          scriptGuid: '11111111111111111111111111111111',
          resourceBindings: [
            {
              resourcePath: 'Assets/Scene/Test.unity',
              resourceType: 'scene',
              bindingKind: 'scene-override',
              componentObjectId: '11400000',
              evidence: { line: 9, lineText: 'guid: 1111' },
              serializedFields: { scalarFields: [], referenceFields: [] },
            },
          ],
          serializedFields: { scalarFields: [], referenceFields: [] },
          unityDiagnostics: [],
        }) as any,
    },
  );

  const summary = [...graph.iterRelationships()].find((rel) => rel.type === 'UNITY_RESOURCE_SUMMARY');
  assert.ok(summary);
  const reason = JSON.parse(String(summary.reason || '{}'));
  assert.equal(reason.resourceType, 'scene');
  assert.deepEqual(reason.bindingKinds, ['scene-override']);
  assert.equal(String(summary.reason).includes('evidence'), false);
});

test('processUnityResources aggregates repetitive diagnostics with capped samples', async () => {
  const graph = createKnowledgeGraph();
  const symbols = ['DiagA', 'DiagB', 'DiagC'];
  const fakeScanContext = {
    symbolToScriptPath: new Map(symbols.map((symbol) => [symbol, `Assets/Scripts/${symbol}.cs`])),
    scriptPathToGuid: new Map(symbols.map((symbol, index) => [`Assets/Scripts/${symbol}.cs`, `${index + 1}`.repeat(32)])),
    guidToResourceHits: new Map(
      symbols.map((symbol, index) => [
        `${index + 1}`.repeat(32),
        [{ resourcePath: `Assets/Scene/${symbol}.unity`, resourceType: 'scene', line: 1, lineText: `guid: ${index + 1}` }],
      ]),
    ),
    resourceDocCache: new Map(),
  };

  for (const symbol of symbols) {
    const classId = generateId('Class', `Assets/Scripts/${symbol}.cs:${symbol}`);
    graph.addNode({
      id: classId,
      label: 'Class',
      properties: { name: symbol, filePath: `Assets/Scripts/${symbol}.cs` },
    });
  }

  const result = await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async () => fakeScanContext as any,
      resolveBindings: async ({ symbol }) => {
        if (symbol === 'DiagC') {
          throw new Error('Unity symbol "SharedName" is ambiguous.');
        }

        return {
          symbol: String(symbol),
          scriptPath: `Assets/Scripts/${symbol}.cs`,
          scriptGuid: '1'.repeat(32),
          resourceBindings: [],
          serializedFields: { scalarFields: [], referenceFields: [] },
          unityDiagnostics: [
            'No MonoBehaviour block matched script guid 123 in Assets/Scene/A.unity.',
            'No MonoBehaviour block matched script guid 123 in Assets/Scene/B.unity.',
          ],
        } as any;
      },
    },
  );

  assert.ok(result.diagnostics.some((line) => line.includes('diagnostics: aggregated')));
  assert.ok(result.diagnostics.some((line) => line.includes('category=no-monobehaviour-match') && line.includes('count=4')));
  assert.ok(result.diagnostics.some((line) => line.includes('category=ambiguous-symbol') && line.includes('count=1')));

  const monoSamples = result.diagnostics.filter((line) => line.includes('sample[no-monobehaviour-match]'));
  assert.ok(monoSamples.length <= 3);
  assert.equal(result.diagnostics.filter((line) => line.startsWith('No MonoBehaviour block matched')).length, 0);
});

test('processUnityResources passes class symbol declarations to scan context builder', async () => {
  const graph = createKnowledgeGraph();
  for (const filePath of ['Assets/Scripts/Alpha.cs', 'Assets/Scripts/Beta.cs']) {
    const symbol = path.basename(filePath, '.cs');
    graph.addNode({
      id: generateId('Class', `${filePath}:${symbol}`),
      label: 'Class',
      properties: {
        name: symbol,
        filePath,
      },
    });
  }

  let capturedInput: any;
  await processUnityResources(
    graph,
    { repoPath: fixtureRoot },
    {
      buildScanContext: async (input: any) => {
        capturedInput = input;
        return {
          symbolToScriptPath: new Map(),
          scriptPathToGuid: new Map(),
          guidToResourceHits: new Map(),
          resourceDocCache: new Map(),
        } as any;
      },
      resolveBindings: async () =>
        ({
          symbol: '',
          scriptPath: '',
          scriptGuid: '',
          resourceBindings: [],
          serializedFields: { scalarFields: [], referenceFields: [] },
          unityDiagnostics: [],
        }) as any,
    },
  );

  assert.ok(Array.isArray(capturedInput.symbolDeclarations));
  assert.equal(capturedInput.symbolDeclarations.length, 2);
  assert.deepEqual(
    capturedInput.symbolDeclarations.map((entry: any) => entry.symbol).sort(),
    ['Alpha', 'Beta'],
  );
});
