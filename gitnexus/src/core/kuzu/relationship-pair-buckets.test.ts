import test from 'node:test';
import assert from 'node:assert/strict';
import { bucketRelationshipLines } from './relationship-pair-buckets.js';

test('bucketRelationshipLines groups CSV lines by from/to pair without retaining all lines in one array', async () => {
  const out = await bucketRelationshipLines([
    '"Class:a","File:x","UNITY_RESOURCE_SUMMARY",1,"",0',
    '"Class:a","CodeElement:b","UNITY_COMPONENT_INSTANCE",1,"",0',
  ], (nodeId) => nodeId.split(':')[0] as any);

  assert.deepEqual([...out.keys()].sort(), ['Class|CodeElement', 'Class|File']);
});
