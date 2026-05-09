import { describe, it, expect } from 'vitest';

import { bucketRelationshipLines } from './relationship-pair-buckets.js';

it('bucketRelationshipLines groups CSV lines by from/to pair without retaining all lines in one array', async () => {
  const out = await bucketRelationshipLines([
    '"Class:a","File:x","UNITY_RESOURCE_SUMMARY",1,"",0',
    '"Class:a","CodeElement:b","UNITY_COMPONENT_INSTANCE",1,"",0',
  ], (nodeId) => nodeId.split(':')[0] as any);

  expect([...out.keys()].sort()).toEqual(['Class|CodeElement', 'Class|File']);
});
