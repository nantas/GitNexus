import { describe, it, expect } from 'vitest';
import {
  resolveEffectiveAnalyzeOptions,
  validateStoredOptions,
} from '../../src/cli/analyze-options.js';

describe('resolveEffectiveAnalyzeOptions', () => {
  it('forwards scopeRules from CLI options', async () => {
    const result = await resolveEffectiveAnalyzeOptions(
      { scopeRules: ['src/core', 'src/cli'] },
      { includeExtensions: [], scopeRules: [], embeddings: false },
    );
    expect(result.scopeRules).toEqual(['src/core', 'src/cli']);
  });

  it('falls back to stored scopeRules when CLI omits them', async () => {
    const result = await resolveEffectiveAnalyzeOptions(
      {},
      { includeExtensions: [], scopeRules: ['src/core'], embeddings: false },
    );
    expect(result.scopeRules).toEqual(['src/core']);
  });

  it('ignores stored options when reuseOptions is false', async () => {
    const result = await resolveEffectiveAnalyzeOptions(
      { reuseOptions: false },
      { includeExtensions: [], scopeRules: ['src/core'], embeddings: true },
    );
    expect(result.scopeRules).toEqual([]);
    expect(result.embeddings).toBe(false);
  });

  it('CLI flags take priority over stored options', async () => {
    const result = await resolveEffectiveAnalyzeOptions(
      { repoAlias: 'new-name', scopeRules: ['src/new'] },
      {
        includeExtensions: [],
        scopeRules: ['src/old'],
        repoAlias: 'old-name',
        embeddings: false,
      },
    );
    expect(result.repoAlias).toBe('new-name');
    expect(result.scopeRules).toEqual(['src/new']);
  });

  it('throws on invalid repo alias', async () => {
    await expect(
      resolveEffectiveAnalyzeOptions(
        { repoAlias: 'ab' },
        { includeExtensions: [], scopeRules: [], embeddings: false },
      ),
    ).rejects.toThrow('Invalid repo alias');
  });
});

describe('validateStoredOptions', () => {
  it('discards stored csproj path when file does not exist', async () => {
    const result = await validateStoredOptions(
      { csharpDefineCsproj: '/nonexistent/path.csproj' },
      '/tmp',
    );
    expect(result.csharpDefineCsproj).toBeUndefined();
  });

  it('preserves stored csproj path when file exists', async () => {
    const result = await validateStoredOptions(
      { csharpDefineCsproj: 'package.json' },
      process.cwd(),
    );
    expect(result.csharpDefineCsproj).toBe('package.json');
  });
});
