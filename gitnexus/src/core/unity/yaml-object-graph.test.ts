import { describe, it, expect } from 'vitest';

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

it('parseUnityYamlObjects parses stripped MonoBehaviour and PrefabInstance blocks', () => {
  const blocks = parseUnityYamlObjects(sampleYaml);
  expect(blocks.length).toBe(3);

  expect(blocks.map((block) => ({ id: block.objectId, type: block.objectType, stripped: block.stripped }))).toEqual([
      { id: '1000', type: 'GameObject', stripped: false },
      { id: '11400000', type: 'MonoBehaviour', stripped: true },
      { id: '2000', type: 'PrefabInstance', stripped: false },
    ],);

  expect(blocks[1].fields.needPause).toBe('0');
  expect(blocks[1].fields.mainUIDocument).toMatch(/fileID: 11400000/);
  expect(blocks[2].fields.m_Modification).toMatch(/propertyPath: needPause/);
});

it('parseUnityYamlObjects keeps inline list entries under their parent field', () => {
  const yamlWithInlineList = `--- !u!114 &11400001
MonoBehaviour:
  buttonMappings:
  - {fileID: 11400000, guid: fedcba9876543210fedcba9876543210, type: 2}
  - {fileID: 0}
  needPause: 0
`;

  const blocks = parseUnityYamlObjects(yamlWithInlineList);
  expect(blocks.length).toBe(1);

  const mono = blocks[0];
  expect(mono.objectType).toBe('MonoBehaviour');
  expect(mono.fields.buttonMappings.includes('- {fileID: 11400000')).toBeTruthy();
  expect(mono.fields['- {fileID']).toBe(undefined);
  expect(mono.fields.needPause).toBe('0');
});

it('parseUnityYamlObjects supports negative object ids in headers', () => {
  const yamlWithNegativeIds = `--- !u!114 &-8618438378761226257
MonoBehaviour:
  m_Script: {fileID: 11500000, guid: 1b63118991a192f4d8ac217fd7fe49ce, type: 3}
  m_Name: Energy By Attack Count
--- !u!114 &11400000
MonoBehaviour:
  m_Name: Graph Root
`;

  const blocks = parseUnityYamlObjects(yamlWithNegativeIds);
  expect(blocks.length).toBe(2);
  expect(blocks[0]?.objectId).toBe('-8618438378761226257');
  expect(blocks[0]?.objectType).toBe('MonoBehaviour');
  expect(blocks[0]?.fields.m_Script || '').toMatch(/guid:\s*1b63118991a192f4d8ac217fd7fe49ce/);
  expect(blocks[1]?.objectId).toBe('11400000');
});
