import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runFullAnalysis } from '../run-analyze.js';
import { getIndexIncompleteReasons } from '../index-freshness.js';
import { loadMeta, unregisterRepo } from '../../storage/repo-manager.js';
import { closeLbug } from '../lbug/lbug-adapter.js';

test('real publication reports resource failure and a plain analyze retries and clears it', { timeout: 600000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-publication-'));
  const guid = 'a'.repeat(32);
  try {
    execFileSync('git', ['init'], { cwd: root, stdio: 'pipe' });
    await fs.mkdir(path.join(root, 'Assets'));
    await fs.writeFile(path.join(root, '.gitignore'), '.gitnexus/\n');
    await fs.writeFile(path.join(root, 'Assets/Carrier.cs'), 'public class Carrier : MonoBehaviour { public object target; }\n');
    await fs.writeFile(path.join(root, 'Assets/Carrier.cs.meta'), `guid: ${guid}\n`);
    await fs.writeFile(path.join(root, 'Assets/Bad.prefab.meta'), `guid: ${'c'.repeat(32)}\n`);
    const content = `--- !u!114 &1\nMonoBehaviour:\n  m_Script: {fileID: 1, guid: ${guid}, type: 3}\n`;
    await fs.writeFile(path.join(root, 'Assets/Bad.prefab'), content
      + `  target: {fileID: 2, ${' '.repeat(600000)}guid: ${'b'.repeat(32)}, type: 3}\n`);
    execFileSync('git', ['add', '.'], { cwd: root, stdio: 'pipe' });
    execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@test', 'commit', '-m', 'fixture'], { cwd: root, stdio: 'pipe' });
    const options = { skipAgentsMd: true, skipSkills: true, skipFts: true, embeddings: false };
    const first = await runFullAnalysis(root, { ...options, force: true }, { onProgress() {} });
    assert.notEqual(first.alreadyUpToDate, true);
    const failed = await loadMeta(path.join(root, '.gitnexus'));
    assert.ok(failed?.unityResourceFailures?.some(f => f.resourcePath === 'Assets/Bad.prefab'));
    assert.ok(getIndexIncompleteReasons(failed!).includes('unity-resource-analysis-failed'));
    // HEAD is unchanged and the resource is not a code-parser input. The failure
    // receipt itself must prevent an up-to-date/derived-skip shortcut.
    await fs.writeFile(path.join(root, 'Assets/Bad.prefab'), content);
    const next = await runFullAnalysis(root, options, { onProgress() {} });
    assert.notEqual(next.alreadyUpToDate, true);
    const repaired = await loadMeta(path.join(root, '.gitnexus'));
    assert.deepEqual(repaired?.unityResourceFailures, []);
    assert.ok(!getIndexIncompleteReasons(repaired!).includes('unity-resource-analysis-failed'));
  } finally {
    await closeLbug();
    await unregisterRepo(root);
    await fs.rm(root, { recursive: true, force: true });
  }
});
