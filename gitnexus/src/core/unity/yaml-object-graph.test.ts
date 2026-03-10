import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUnityYamlObjects } from './yaml-object-graph.js';

const sampleYaml = `--- !u!1 &1000
GameObject:
  m_Name: MainUIRoot
--- !u!114 &11400000 stripped
MonoBehaviour:
  m_CorrespondingSourceObject: {fileID: 11400000, guid: abcdef0123456789abcdef0123456789, type: 3}
  m_PrefabInstance: {fileID: 2000}
  needPause: 0
  mainUIDocument: {fileID: 11400000, guid: fedcba9876543210fedcba9876543210, type: 2}
--- !u!1001 &2000
PrefabInstance:
  m_Modification:
    m_Modifications:
    - target: {fileID: 11400000}
      propertyPath: needPause
      value: 1
      objectReference: {fileID: 0}
`;

test('parseUnityYamlObjects parses stripped MonoBehaviour and PrefabInstance blocks', () => {
  const blocks = parseUnityYamlObjects(sampleYaml);
  assert.equal(blocks.length, 3);

  assert.deepEqual(
    blocks.map((block) => ({ id: block.objectId, type: block.objectType, stripped: block.stripped })),
    [
      { id: '1000', type: 'GameObject', stripped: false },
      { id: '11400000', type: 'MonoBehaviour', stripped: true },
      { id: '2000', type: 'PrefabInstance', stripped: false },
    ],
  );

  assert.equal(blocks[1].fields.needPause, '0');
  assert.match(blocks[1].fields.mainUIDocument, /fileID: 11400000/);
  assert.match(blocks[2].fields.m_Modification, /propertyPath: needPause/);
});

test('parseUnityYamlObjects keeps inline list entries under their parent field', () => {
  const yamlWithInlineList = `--- !u!114 &11400001
MonoBehaviour:
  buttonMappings:
  - {fileID: 11400000, guid: fedcba9876543210fedcba9876543210, type: 2}
  - {fileID: 0}
  needPause: 0
`;

  const blocks = parseUnityYamlObjects(yamlWithInlineList);
  assert.equal(blocks.length, 1);

  const mono = blocks[0];
  assert.equal(mono.objectType, 'MonoBehaviour');
  assert.ok(mono.fields.buttonMappings.includes('- {fileID: 11400000'));
  assert.equal(mono.fields['- {fileID'], undefined);
  assert.equal(mono.fields.needPause, '0');
});
