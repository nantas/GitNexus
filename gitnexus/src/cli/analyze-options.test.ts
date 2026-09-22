import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadAnalyzeConfig, mergeAnalyzeOptions } from './analyze-config.js';

test('fork analyze defaults use committed .gitnexusrc and CLI overrides', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-rc-'));
  try {
    await fs.writeFile(
      path.join(root, '.gitnexusrc'),
      JSON.stringify({
        csharpDefineCsproj: 'Assembly-CSharp.csproj',
        includeExtensions: ['.cs', '.meta'],
        scopeRules: ['Assets/', 'Packages/com.veewo.*'],
      }),
    );
    const configured = loadAnalyzeConfig(root);
    assert.deepEqual(configured?.includeExtensions, ['.cs', '.meta']);
    assert.deepEqual(configured?.scopeRules, ['Assets/', 'Packages/com.veewo.*']);
    const merged = mergeAnalyzeOptions({ includeExtensions: ['.ts'] }, configured);
    assert.deepEqual(merged.includeExtensions, ['.ts']);
    assert.deepEqual(merged.scopeRules, configured?.scopeRules);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
