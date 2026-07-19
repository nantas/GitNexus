import test from 'node:test';
import assert from 'node:assert/strict';
import { removeLbugArtifacts } from './analyze-storage.js';

test('LadybugDB rebuild rejects WAL deletion failures', async () => {
  const removed: string[] = [];
  await assert.rejects(
    removeLbugArtifacts('C:\\repo\\.gitnexus\\lbug', async (target) => {
      removed.push(target);
      if (target.endsWith('.wal')) throw new Error('access denied');
    }),
    /failed to remove LadybugDB artifact.*lbug\.wal.*access denied/i,
  );
  assert.deepEqual(removed, [
    'C:\\repo\\.gitnexus\\lbug',
    'C:\\repo\\.gitnexus\\lbug.wal',
  ]);
});
