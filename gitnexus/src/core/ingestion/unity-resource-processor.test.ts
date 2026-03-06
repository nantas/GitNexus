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
