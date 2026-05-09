import { describe, it, expect } from 'vitest';

import { replayFallbackRelationships } from './fallback-relationship-replay.js';

it('replayFallbackRelationships returns attempted/succeeded/failed for mixed insert outcomes', async () => {
  const validRelLines = [
    '"from","to","type","confidence","reason","step"',
    '"Class:A","File:A","UNITY_RESOURCE_SUMMARY",1,"ok",0',
    '"Class:B","File:B","UNITY_RESOURCE_SUMMARY",1,"ok",0',
    '"Class:C","File:C","UNITY_RESOURCE_SUMMARY",1,"ok",0',
  ];

  const stats = await replayFallbackRelationships(validRelLines, {
    validTables: new Set(['Class', 'File']),
    getNodeLabel: (id: string) => id.split(':')[0] || '',
    insertRelationship: async ({ fromId }) => {
      if (fromId === 'Class:B') {
        throw new Error('simulated insert failure');
      }
    },
  });

  expect(stats).toEqual({
    attempted: 3,
    succeeded: 2,
    failed: 1,
  });
});
