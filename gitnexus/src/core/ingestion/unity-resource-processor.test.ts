import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateId } from '../../lib/utils.js';
import { createKnowledgeGraph } from '../graph/graph.js';
import { processUnityResources } from './unity-resource-processor.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity');
const symbols = ['Global', 'BattleMode', 'PlayerActor', 'MainUIManager'];

test('processUnityResources adds Unity resource relationships and component payload nodes', async () => {
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
  const unityInstanceRelations = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_COMPONENT_INSTANCE');
  const componentNodes = [...graph.iterNodes()].filter(
    (node) => node.label === 'CodeElement' && /\.(unity|prefab)$/.test(String(node.properties.filePath)),
  );

  assert.ok(unityFileRelations.length > 0);
  assert.ok(unityInstanceRelations.length > 0);
  assert.ok(componentNodes.length > 0);
  assert.ok(componentNodes.some((node) => String(node.properties.description).includes('mainUIDocument')));
  assert.ok(result.bindingCount >= symbols.length);
  assert.ok(result.timingsMs.scanContext >= 0);
  assert.ok(result.timingsMs.resolve >= 0);
  assert.ok(result.timingsMs.graphWrite > 0);
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

test('processUnityResources writes UNITY_COMPONENT_INSTANCE only for canonical class node', async () => {
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

  const instanceRelations = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_COMPONENT_INSTANCE');
  assert.equal(instanceRelations.length, 1);
  assert.equal(instanceRelations[0]?.sourceId, canonicalClassId);
  assert.equal(result.processedSymbols, 1);
  assert.equal(result.bindingCount, 1);
  assert.ok(result.diagnostics.some((line) => line.includes('selected=1')));
  assert.ok(result.diagnostics.some((line) => line.includes('skip-non-canonical=1')));
});

test('processUnityResources writes UNITY_SERIALIZED_TYPE_IN for serializable class field matches', async () => {
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

  const serializedTypeEdges = [...graph.iterRelationships()].filter((rel) => rel.type === 'UNITY_SERIALIZED_TYPE_IN');
  assert.equal(serializedTypeEdges.length, 1);
  assert.equal(serializedTypeEdges[0]?.sourceId, serializableClassId);
});

test('processUnityResources writes compact unity payload by default', async () => {
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

  const component = [...graph.iterNodes()].find((node) => node.label === 'CodeElement');
  assert.ok(component);
  const payload = JSON.parse(String(component.properties.description));
  assert.equal(payload.bindingKind, 'scene-override');
  assert.equal(payload.componentObjectId, '11400000');
  assert.ok(Array.isArray(payload.serializedFields.scalarFields));
  assert.equal(payload.resourcePath, undefined);
  assert.equal(payload.resourceType, undefined);
  assert.equal(payload.evidence, undefined);
});

test('processUnityResources includes structured assetRefPaths in component payload', async () => {
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

  const component = [...graph.iterNodes()].find((node) => node.label === 'CodeElement');
  assert.ok(component);
  const payload = JSON.parse(String(component.properties.description));
  assert.equal(payload.assetRefPaths?.length, 1);
  assert.equal(payload.assetRefPaths?.[0]?.fieldName, '_Head_Ref');
  assert.equal(payload.assetRefPaths?.[0]?.isSprite, true);
});

test('processUnityResources writes full unity payload when payloadMode=full', async () => {
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

  const component = [...graph.iterNodes()].find((node) => node.label === 'CodeElement');
  assert.ok(component);
  const payload = JSON.parse(String(component.properties.description));
  assert.equal(payload.resourcePath, 'Assets/Scene/Test.unity');
  assert.equal(payload.resourceType, 'scene');
  assert.equal(payload.evidence?.line, 9);
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
