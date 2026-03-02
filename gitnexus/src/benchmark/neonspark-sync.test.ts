import test from 'node:test';
import assert from 'node:assert/strict';
import { parseManifest, shouldIncludeRelativePath } from './neonspark-sync.js';

test('parseManifest strips comments and blank lines', () => {
  const roots = parseManifest(`
# main gameplay
Assets/NEON/Code

Packages/com.veewo.*
Packages/com.neonspark.*
`);
  assert.deepEqual(roots, ['Assets/NEON/Code', 'Packages/com.veewo.*', 'Packages/com.neonspark.*']);
});

test('shouldIncludeRelativePath keeps only .cs under allowed roots', () => {
  const roots = ['Assets/NEON/Code', 'Packages/com.veewo.*', 'Packages/com.neonspark.*'];
  assert.equal(shouldIncludeRelativePath('Assets/NEON/Code/Game/A.cs', roots), true);
  assert.equal(shouldIncludeRelativePath('Packages/com.veewo.stat/Runtime/Stat.cs', roots), true);
  assert.equal(shouldIncludeRelativePath('Packages/com.unity.inputsystem/Runtime/X.cs', roots), false);
  assert.equal(shouldIncludeRelativePath('Assets/NEON/Code/Game/A.prefab', roots), false);
});
