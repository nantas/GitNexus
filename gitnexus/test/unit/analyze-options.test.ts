import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeRepoAlias,
  parseExtensionList,
  resolveEffectiveAnalyzeOptions,
  validateStoredOptions,
} from '../../src/cli/analyze-options.js';

describe('parseExtensionList', () => {
  it('normalizes dot prefixes', () => {
    const exts = parseExtensionList('cs,.ts, go ');
    expect(exts).toEqual(['.cs', '.ts', '.go']);
  });
});

describe('normalizeRepoAlias', () => {
  it('returns undefined for undefined input', () => {
    expect(normalizeRepoAlias(undefined)).toBeUndefined();
  });

  it('accepts valid alias', () => {
    expect(normalizeRepoAlias('neonspark-v1-subset')).toBe('neonspark-v1-subset');
  });

  it('throws for too short alias', () => {
    expect(() => normalizeRepoAlias('ab')).toThrow(/repo alias/i);
  });

  it('throws for invalid characters', () => {
    expect(() => normalizeRepoAlias('bad alias')).toThrow(/repo alias/i);
  });
});

describe('resolveEffectiveAnalyzeOptions', () => {
  it('reuses stored settings when CLI omits them', async () => {
    const resolved = await resolveEffectiveAnalyzeOptions(
      {},
      {
        includeExtensions: ['.cs'],
        scopeRules: ['Assets/NEON/Code'],
        repoAlias: 'neonspark-v1-subset',
        embeddings: true,
        csharpDefineCsproj: '/path/to/Assembly-CSharp.csproj',
      },
    );

    expect(resolved.includeExtensions).toEqual(['.cs']);
    expect(resolved.scopeRules).toEqual(['Assets/NEON/Code']);
    expect(resolved.repoAlias).toBe('neonspark-v1-subset');
    expect(resolved.embeddings).toBe(true);
    expect(resolved.csharpDefineCsproj).toBe('/path/to/Assembly-CSharp.csproj');
  });

  it('disables reuse via reuseOptions=false', async () => {
    const resolved = await resolveEffectiveAnalyzeOptions(
      { reuseOptions: false },
      {
        includeExtensions: ['.cs'],
        scopeRules: ['Assets/NEON/Code'],
        repoAlias: 'neonspark-v1-subset',
        embeddings: true,
        csharpDefineCsproj: '/path/to/Assembly-CSharp.csproj',
      },
    );

    expect(resolved.includeExtensions).toEqual([]);
    expect(resolved.scopeRules).toEqual([]);
    expect(resolved.repoAlias).toBeUndefined();
    expect(resolved.embeddings).toBe(false);
    expect(resolved.csharpDefineCsproj).toBeUndefined();
  });

  it('prefers explicit CLI values over stored settings', async () => {
    const resolved = await resolveEffectiveAnalyzeOptions(
      {
        extensions: '.ts',
        repoAlias: 'new-alias',
        embeddings: false,
        csharpDefineCsproj: '/new/csproj.csproj',
      },
      {
        includeExtensions: ['.cs'],
        scopeRules: ['Assets/NEON/Code'],
        repoAlias: 'old-alias',
        embeddings: true,
        csharpDefineCsproj: '/old/csproj.csproj',
      },
    );

    expect(resolved.includeExtensions).toEqual(['.ts']);
    expect(resolved.scopeRules).toEqual(['Assets/NEON/Code']);
    expect(resolved.repoAlias).toBe('new-alias');
    expect(resolved.embeddings).toBe(false);
    expect(resolved.csharpDefineCsproj).toBe('/new/csproj.csproj');
  });

  it('uses defaults when no stored options exist', async () => {
    const resolved = await resolveEffectiveAnalyzeOptions({}, undefined);

    expect(resolved.includeExtensions).toEqual([]);
    expect(resolved.scopeRules).toEqual([]);
    expect(resolved.repoAlias).toBeUndefined();
    expect(resolved.embeddings).toBe(false);
    expect(resolved.csharpDefineCsproj).toBeUndefined();
  });
});

describe('validateStoredOptions', () => {
  it('returns defaults for undefined stored', async () => {
    const validated = await validateStoredOptions(undefined, '/tmp');
    expect(validated.includeExtensions).toEqual([]);
    expect(validated.scopeRules).toEqual([]);
    expect(validated.repoAlias).toBeUndefined();
    expect(validated.embeddings).toBe(false);
    expect(validated.csharpDefineCsproj).toBeUndefined();
  });

  it('passes valid options unchanged', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-valid-'));
    const csprojPath = path.join(tmpDir, 'Assembly-CSharp.csproj');
    await fs.writeFile(csprojPath, '<Project/>', 'utf-8');

    try {
      const validated = await validateStoredOptions(
        {
          includeExtensions: ['.cs', '.ts'],
          scopeRules: ['Assets/'],
          repoAlias: 'my-repo',
          embeddings: true,
          csharpDefineCsproj: csprojPath,
        },
        tmpDir,
      );

      expect(validated.includeExtensions).toEqual(['.cs', '.ts']);
      expect(validated.scopeRules).toEqual(['Assets']);
      expect(validated.repoAlias).toBe('my-repo');
      expect(validated.embeddings).toBe(true);
      expect(validated.csharpDefineCsproj).toBe(csprojPath);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('warns and falls back for invalid repo alias', async () => {
    const warns: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg: string) => warns.push(msg);

    try {
      const validated = await validateStoredOptions(
        { repoAlias: 'bad alias!' },
        '/tmp',
      );
      expect(validated.repoAlias).toBeUndefined();
      expect(warns.some((w) => /Invalid repo alias/.test(w))).toBe(true);
    } finally {
      console.warn = origWarn;
    }
  });

  it('warns and filters invalid extensions', async () => {
    const warns: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg: string) => warns.push(msg);

    try {
      const validated = await validateStoredOptions(
        { includeExtensions: ['cs', '.ts'] },
        '/tmp',
      );
      expect(validated.includeExtensions).toEqual(['.ts']);
      expect(warns.some((w) => /Invalid extension format/.test(w))).toBe(true);
    } finally {
      console.warn = origWarn;
    }
  });

  it('warns and falls back when csproj file is missing', async () => {
    const warns: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg: string) => warns.push(msg);

    try {
      const validated = await validateStoredOptions(
        { csharpDefineCsproj: '/nonexistent/path.csproj' },
        '/tmp',
      );
      expect(validated.csharpDefineCsproj).toBeUndefined();
      expect(warns.some((w) => /not found/.test(w))).toBe(true);
    } finally {
      console.warn = origWarn;
    }
  });

  it('filters empty scope rules', async () => {
    const validated = await validateStoredOptions(
      { scopeRules: ['', '  ', 'Assets/'] },
      '/tmp',
    );
    expect(validated.scopeRules).toEqual(['Assets']);
  });

  it('resolves relative csproj paths against repoPath', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-csproj-rel-'));
    const csprojPath = path.join(tmpDir, 'Assembly-CSharp.csproj');
    await fs.writeFile(csprojPath, '<Project/>', 'utf-8');

    try {
      const validated = await validateStoredOptions(
        { csharpDefineCsproj: 'Assembly-CSharp.csproj' },
        tmpDir,
      );
      expect(validated.csharpDefineCsproj).toBe('Assembly-CSharp.csproj');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
