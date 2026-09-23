import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { resolveAnalysisInputs } from '../../src/core/analysis-inputs.js';

describe('effective analysis inputs', () => {
  it('normalizes equivalent extension and scope sets', async () => {
    const a = await resolveAnalysisInputs('.', {
      includeExtensions: ['TS', '.cs', '.ts'],
      scopeRules: ['./src/', 'Assets', 'src'],
    });
    const b = await resolveAnalysisInputs('.', {
      includeExtensions: ['.cs', '.ts'],
      scopeRules: ['Assets/', 'src'],
    });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect((await resolveAnalysisInputs('.', {})).fingerprint).not.toBe(a.fingerprint);
  });
  it('fingerprints effective define symbols, including empty enabled profiles, not paths', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gn-analysis-inputs-'));
    try {
      await fs.writeFile(
        path.join(root, 'a.csproj'),
        '<Project><DefineConstants>B;A</DefineConstants></Project>',
      );
      await fs.writeFile(
        path.join(root, 'b.csproj'),
        '<Project><DefineConstants>A;B;A</DefineConstants></Project>',
      );
      const a = await resolveAnalysisInputs(root, { csharpDefineCsproj: 'a.csproj' });
      const b = await resolveAnalysisInputs(root, { csharpDefineCsproj: 'b.csproj' });
      expect(a.fingerprint).toBe(b.fingerprint);
      expect(a.csharpDefineSymbols).toEqual(['A', 'B']);
      await fs.writeFile(path.join(root, 'a.csproj'), '<Project/>');
      const empty = await resolveAnalysisInputs(root, { csharpDefineCsproj: 'a.csproj' });
      expect(empty.csharpDefineSymbols).toEqual([]);
      expect(empty.fingerprint).not.toBe(a.fingerprint);
      expect(empty.fingerprint).not.toBe((await resolveAnalysisInputs(root, {})).fingerprint);
      await expect(
        resolveAnalysisInputs(root, { csharpDefineCsproj: 'missing.csproj' }),
      ).rejects.toThrow('Failed to read C# csproj');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
