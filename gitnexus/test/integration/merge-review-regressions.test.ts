import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { detectIndexContentDrift } from '../../src/core/index-content-drift.js';
import { runFullAnalysis } from '../../src/core/run-analyze.js';
import { initLbug, closeLbug, executeQuery } from '../../src/core/lbug/lbug-adapter.js';
import { getStoragePaths, loadMeta, saveMeta } from '../../src/storage/repo-manager.js';
import { LocalBackend } from '../../src/mcp/local/local-backend.js';
import { createTempDir } from '../helpers/test-db.js';

// Exercise actual freshness decisions, incremental COPY, and persisted evidence.
describe.skipIf(process.platform === 'win32')('merge review regressions', () => {
  let repo: Awaited<ReturnType<typeof createTempDir>>;
  let home: Awaited<ReturnType<typeof createTempDir>>;
  let oldHome: string | undefined;
  const write = async (name: string, content: string) => {
    await fs.mkdir(path.dirname(path.join(repo.dbPath, name)), { recursive: true });
    await fs.writeFile(path.join(repo.dbPath, name), content);
  };
  const commit = () => {
    execFileSync('git', ['add', '-A'], { cwd: repo.dbPath });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'fixture'], {
      cwd: repo.dbPath,
    });
  };
  const analyze = async (options: Parameters<typeof runFullAnalysis>[1] = {}) => {
    let incremental = false;
    const result = await runFullAnalysis(
      repo.dbPath,
      {
        skipFts: true,
        skipAgentsMd: true,
        skipSkills: true,
        ...options,
      },
      {
        onProgress: (_phase, _percent, message) => {
          if (message?.startsWith('Removing rows for changed files')) incremental = true;
        },
      },
    );
    return { ...result, incremental };
  };
  const query = async (cypher: string) => {
    await initLbug(getStoragePaths(repo.dbPath).lbugPath);
    try {
      return await executeQuery(cypher);
    } finally {
      await closeLbug();
    }
  };
  beforeEach(async () => {
    repo = await createTempDir('merge-review-repo-');
    home = await createTempDir('merge-review-home-');
    oldHome = process.env.GITNEXUS_HOME;
    process.env.GITNEXUS_HOME = home.dbPath;
    execFileSync('git', ['init', '-q'], { cwd: repo.dbPath });
    await write('.gitignore', '.gitnexus/\n.agents/\n.claude/\nAGENTS.md\nCLAUDE.md\n');
  });
  afterEach(async () => {
    await closeLbug();
    if (oldHome === undefined) delete process.env.GITNEXUS_HOME;
    else process.env.GITNEXUS_HOME = oldHome;
    await repo.cleanup();
    await home.cleanup();
  });

  it('rebuilds clean HEAD for scope/extensions and same-path external define changes', async () => {
    await write('src/a.ts', 'export function alpha() { return 1; }');
    await write(
      'other/b.cs',
      '#if FIRST\npublic class First {}\n#else\npublic class Second {}\n#endif\n',
    );
    commit();
    await analyze();
    expect((await analyze()).alreadyUpToDate).toBe(true);
    expect((await analyze({ scopeRules: ['src/'] })).alreadyUpToDate).not.toBe(true);
    expect(await query('MATCH (c:Class) RETURN c.name AS name')).toEqual([]);
    await analyze({ includeExtensions: ['.cs'] });
    expect(await query('MATCH (f:Function) RETURN f.name AS name')).toEqual([]);
    const profile = path.join(home.dbPath, 'external.csproj');
    await fs.writeFile(profile, '<Project><DefineConstants>FIRST</DefineConstants></Project>');
    const options = { csharpDefineCsproj: profile };
    await analyze(options);
    expect(await query('MATCH (c:Class) RETURN c.name AS name')).toEqual([{ name: 'First' }]);
    expect((await analyze(options)).alreadyUpToDate).toBe(true);
    await fs.writeFile(profile, '<Project><DefineConstants>SECOND</DefineConstants></Project>');
    expect((await analyze(options)).alreadyUpToDate).not.toBe(true);
    expect(await query('MATCH (c:Class) RETURN c.name AS name')).toEqual([{ name: 'Second' }]);
    // Removing the profile and extension/scope filters returns to defaults.
    expect((await analyze()).alreadyUpToDate).not.toBe(true);
    expect(await query('MATCH (f:Function) RETURN f.name AS name')).toEqual([{ name: 'alpha' }]);
    const storage = getStoragePaths(repo.dbPath).storagePath;
    const meta = (await loadMeta(storage))!;
    delete meta.analysisInputFingerprint;
    await saveMeta(storage, meta);
    expect((await analyze()).alreadyUpToDate).not.toBe(true);
    expect((await analyze()).alreadyUpToDate).toBe(true);
  }, 180_000);

  it('persists scoped coverage, migrates old receipts, and does not reuse receipts as defaults', async () => {
    await write('src/a.ts', 'export function alpha() { return 1; }');
    await write('other/b.ts', 'export function beta() { return 2; }');
    await write('src/readme.md', 'outside extension');
    commit();
    const options = { scopeRules: ['src/'], includeExtensions: ['TS'] };
    await analyze(options);
    const storage = getStoragePaths(repo.dbPath).storagePath;
    let meta = (await loadMeta(storage))!;
    expect(meta.indexCoverage).toMatchObject(options);
    expect(
      await detectIndexContentDrift(repo.dbPath, meta.fileHashes, meta.indexCoverage),
    ).toMatchObject({ kind: 'current' });
    expect((await analyze(options)).alreadyUpToDate).toBe(true);
    // A clean checkout with the same input fingerprint must still upgrade a legacy receipt.
    delete meta.indexCoverage!.scopeRules;
    delete meta.indexCoverage!.includeExtensions;
    await saveMeta(storage, meta);
    expect((await analyze(options)).alreadyUpToDate).not.toBe(true);
    meta = (await loadMeta(storage))!;
    expect(meta.indexCoverage).toMatchObject(options);
    expect((await analyze(options)).alreadyUpToDate).toBe(true);
    // Omitting CLI options means defaults, not the previous receipt's selection.
    expect((await analyze()).alreadyUpToDate).not.toBe(true);
    meta = (await loadMeta(storage))!;
    expect(meta.indexCoverage).toMatchObject({ scopeRules: [], includeExtensions: [] });
    expect(Object.keys(meta.fileHashes!)).toContain('other/b.ts');
    expect(Object.keys(meta.fileHashes!)).toContain('src/readme.md');
    expect(
      await detectIndexContentDrift(repo.dbPath, meta.fileHashes, meta.indexCoverage),
    ).toMatchObject({ kind: 'current' });
  }, 180_000);

  it('adds, retains without duplicates, and removes the Unity root on safe full writes', async () => {
    await write('Assets/Plain.cs', 'public class Plain { public void Run() {} }');
    commit();
    await analyze();
    const roots = () =>
      query("MATCH (m:Method) WHERE m.id='Method:unity-runtime-root' RETURN m.id AS id");
    const calls = () =>
      query(
        "MATCH (m:Method)-[r:CodeRelation {type:'CALLS'}]->(n) WHERE m.id='Method:unity-runtime-root' RETURN n.name AS name",
      );
    expect(await roots()).toEqual([]);
    await write(
      'Assets/Foo.cs',
      'public class Foo : MonoBehaviour { public void Start() { Run(); } public void Run() {} }',
    );
    commit();
    expect((await analyze()).incremental).toBe(false);
    expect(await roots()).toHaveLength(1);
    expect(await calls()).toEqual([{ name: 'Start' }]);
    await write('Assets/Plain.cs', 'public class Plain { public void Run() { int x = 1; } }');
    commit();
    expect((await analyze()).incremental).toBe(false);
    expect(await roots()).toHaveLength(1);
    expect(await calls()).toEqual([{ name: 'Start' }]);
    expect((await analyze()).alreadyUpToDate).toBe(true);
    expect(await roots()).toHaveLength(1);
    await fs.unlink(path.join(repo.dbPath, 'Assets/Foo.cs'));
    commit();
    expect((await analyze()).incremental).toBe(false);
    expect(await roots()).toEqual([]);
    expect(await calls()).toEqual([]);
  }, 180_000);

  it('persists static process evidence outside Unity', async () => {
    await write(
      'src/main.ts',
      'export function main() { return load(); }\nfunction load() { return finish(); }\nfunction finish() { return 42; }',
    );
    commit();
    await analyze();
    const rows = await query(
      'MATCH (p:Process) RETURN p.processSubtype AS subtype, p.runtimeChainConfidence AS confidence, p.sourceReasons AS reasons, p.sourceConfidences AS confidences',
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.subtype).toBe('static_calls');
      expect(row.confidence).toBe('high');
      expect(row.reasons.length).toBeGreaterThan(0);
      expect(row.confidences.length).toBeGreaterThan(0);
    }
    const backend = new LocalBackend();
    try {
      await backend.init();
      const context = await backend.callTool('context', {
        name: 'main',
        file_path: 'src/main.ts',
        response_profile: 'full',
      });
      expect(context.status).toBe('found');
      expect(context.processes.length).toBeGreaterThan(0);
      expect(
        context.processes.every(
          (p: { process_subtype?: string }) => p.process_subtype === 'static_calls',
        ),
      ).toBe(true);
    } finally {
      await backend.dispose();
    }
  }, 180_000);
});
