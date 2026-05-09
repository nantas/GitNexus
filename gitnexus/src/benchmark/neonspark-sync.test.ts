import { describe, it, expect } from 'vitest'

import { parseManifest, shouldIncludeRelativePath } from './neonspark-sync.js';

it('parseManifest strips comments and blank lines', () => {
  const roots = parseManifest(`
# main gameplay
Assets/NEON/Code

Packages/com.veewo.*
Packages/com.neonspark.*
`);
  expect(roots).toEqual(['Assets/NEON/Code', 'Packages/com.veewo.*', 'Packages/com.neonspark.*']);
});

it('shouldIncludeRelativePath keeps only .cs under allowed roots', () => {
  const roots = ['Assets/NEON/Code', 'Packages/com.veewo.*', 'Packages/com.neonspark.*'];
  expect(shouldIncludeRelativePath('Assets/NEON/Code/Game/A.cs', roots)).toBe(true);
  expect(shouldIncludeRelativePath('Packages/com.veewo.stat/Runtime/Stat.cs', roots)).toBe(true);
  expect(shouldIncludeRelativePath('Packages/com.unity.inputsystem/Runtime/X.cs', roots)).toBe(false);
  expect(shouldIncludeRelativePath('Assets/NEON/Code/Game/A.prefab', roots)).toBe(false);
});
