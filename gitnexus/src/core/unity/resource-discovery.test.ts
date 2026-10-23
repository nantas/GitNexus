import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { discoverUnityResources } from './resource-discovery.js';

test('discovery keeps case-insensitive, repeated and same-line script GUID semantics', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-discovery-'));
  let result: Awaited<ReturnType<typeof discoverUnityResources>> | undefined;
  try {
    const a = 'a'.repeat(32),
      b = 'b'.repeat(32);
    await fs.writeFile(
      path.join(root, 'Input.prefab'),
      `M_SCRIPT: {GUID: ${a.toUpperCase()}} m_Script: {guid: ${b}}\n` +
        `m_Script: {guid: ${a}}\nm_Script: {guid: ${b}}\n`,
    );
    result = await discoverUnityResources({
      repoRoot: root,
      resourceFiles: ['Input.prefab'],
      scriptGuids: [a, b],
      assetGuidToPath: new Map(),
    });
    assert.deepEqual(result.failures, []);
    assert.deepEqual(
      [...result.hits].map(([guid, hits]) => [guid, hits.map((hit) => hit.line)]),
      [
        [a, [1]],
        [b, [1]],
      ],
    );
  } finally {
    await result?.sourceRecords.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
