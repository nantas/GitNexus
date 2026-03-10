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

test('processUnityResources skips resolve for symbols missing scan context mapping', async () => {
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
  assert.ok(result.diagnostics.some((line) => line.includes('missing scanContext script mapping')));
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
  assert.equal(result.processedSymbols, 2);
  assert.equal(result.bindingCount, 2);
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
