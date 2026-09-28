import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { branchSlug } from '../storage/branch-index.js';
import { parseAnalyzeConfig } from './analyze-config.js';
import {
  createRepositoryAnalyzeConfig,
  planRepositoryAnalyzeConfig,
  readMigrationMetadata,
} from './setup-analyze-config.js';

const exec = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliPath = path.join(packageRoot, 'dist', 'cli', 'index.js');

async function fixture() {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-rc-repo-'));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-rc-home-'));
  await exec('git', ['init', '-q', repo]);
  await exec('git', ['-c', 'user.name=GitNexus Test', '-c', 'user.email=test@example.invalid',
    'commit', '--allow-empty', '-qm', 'fixture'], { cwd: repo });
  return {
    repo, home,
    async cleanup() {
      await fs.rm(repo, { recursive: true, force: true });
      await fs.rm(home, { recursive: true, force: true });
    },
  };
}

async function run(repo: string, home: string, args: string[]) {
  return exec(process.execPath, [cliPath, 'setup', '--scope', 'project', '--agent', 'opencode', ...args], {
    cwd: repo, env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}

test('missing primary uses mirror; corrupt primary never falls back and leaves metadata intact', async () => {
  const f = await fixture();
  try {
    const dir = path.join(f.repo, '.gitnexus');
    await fs.mkdir(dir);
    const mirror = JSON.stringify({ repoPath: f.repo, indexedAt: '2025-01-01', analyzeOptions: {
      scopeRules: ['Assets/'], includeExtensions: ['.cs'], repoAlias: 'unity',
      embeddings: true, aiContext: false,
    } });
    await fs.writeFile(path.join(dir, 'meta.json'), mirror);
    const first = await readMigrationMetadata(dir);
    assert.equal(first.state, 'valid');
    const plan = await planRepositoryAnalyzeConfig(f.repo, 'migrate');
    assert.deepEqual(plan.proposed, {
      scopeRules: ['Assets/'], includeExtensions: ['.cs'], name: 'unity',
      embeddings: true, skipAgentsMd: true,
    });
    assert.match(plan.metadataPath ?? '', /meta\.json$/);
    await fs.writeFile(path.join(dir, 'gitnexus.json'), '{broken');
    const second = await readMigrationMetadata(dir);
    assert.equal(second.state, 'invalid');
    const failed = await planRepositoryAnalyzeConfig(f.repo, 'migrate');
    assert.match(failed.error ?? '', /gitnexus\.json/);
    assert.equal(await fs.readFile(path.join(dir, 'meta.json'), 'utf8'), mirror);
  } finally { await f.cleanup(); }
});

test('coverage wins but disagreement requires explicit choice; empty arrays mean all', async () => {
  const f = await fixture();
  try {
    const dir = path.join(f.repo, '.gitnexus');
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, 'gitnexus.json'), JSON.stringify({
      repoPath: f.repo, indexedAt: '2026-01-01',
      indexCoverage: { scopeRules: [], includeExtensions: [], maxFileSizeBytes: 1048576 },
      analyzeOptions: { scopeRules: ['Assets/'], includeExtensions: ['.cs'] },
    }));
    const plan = await planRepositoryAnalyzeConfig(f.repo, 'migrate');
    assert.deepEqual(plan.proposed.scopeRules, []);
    assert.deepEqual(plan.proposed.includeExtensions, []);
    assert.equal(plan.proposed.maxFileSize, '1024');
    assert.equal(plan.conflicts.length, 2);
    await assert.rejects(() => createRepositoryAnalyzeConfig(plan), /incomplete/);
    const resolved = await planRepositoryAnalyzeConfig(f.repo, 'migrate', {
      scope: 'Assets/', extensions: '.cs,.meta',
    });
    assert.deepEqual(resolved.conflicts, []);
    await createRepositoryAnalyzeConfig(resolved);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.repo, '.gitnexusrc'), 'utf8')).includeExtensions, ['.cs', '.meta']);
  } finally { await f.cleanup(); }
});

test('foreign ownership and divergent branch selection remain unresolved', async () => {
  const f = await fixture();
  try {
    const dir = path.join(f.repo, '.gitnexus');
    await fs.mkdir(dir);
    const flat = path.join(dir, 'gitnexus.json');
    await fs.writeFile(flat, JSON.stringify({ repoPath: f.home, indexCoverage: {
      scopeRules: ['A/'], includeExtensions: ['.cs'],
    } }));
    assert.match((await planRepositoryAnalyzeConfig(f.repo, 'migrate')).error ?? '', /repoPath/);
    await fs.writeFile(flat, JSON.stringify({ repoPath: f.repo, indexCoverage: {
      scopeRules: ['A/'], includeExtensions: ['.cs'],
    } }));
    const { stdout } = await exec('git', ['branch', '--show-current'], { cwd: f.repo });
    const branch = stdout.trim();
    const activeDir = path.join(dir, 'branches', branchSlug(branch));
    await fs.mkdir(activeDir, { recursive: true });
    await fs.writeFile(path.join(activeDir, 'gitnexus.json'), JSON.stringify({ repoPath: f.repo,
      indexCoverage: { scopeRules: ['B/'], includeExtensions: ['.cs'] },
    }));
    assert.match((await planRepositoryAnalyzeConfig(f.repo, 'migrate')).conflicts.join(' '), /active branch/);
  } finally { await f.cleanup(); }
});

test('CLI non-TTY auto stays pending; explicit create and repeated setup preserve bytes', async () => {
  const f = await fixture();
  try {
    const pending = await run(f.repo, f.home, []);
    assert.match(pending.stdout, /Analysis config: pending/);
    await assert.rejects(fs.access(path.join(f.repo, '.gitnexusrc')));
    const created = await run(f.repo, f.home, ['--rc-mode', 'create', '--rc-scope', 'Assets/,Packages/',
      '--rc-extensions', '.cs,.meta', '--accept-rc']);
    assert.match(created.stdout, /Analysis config: created/);
    const file = path.join(f.repo, '.gitnexusrc');
    const before = await fs.readFile(file);
    const repeated = await run(f.repo, f.home, []);
    assert.match(repeated.stdout, /Analysis config: preserved/);
    assert.deepEqual(await fs.readFile(file), before);
    await assert.rejects(run(f.repo, f.home, ['--rc-mode', 'create', '--rc-scope', 'all',
      '--rc-extensions', 'all', '--accept-rc']));
    assert.deepEqual(await fs.readFile(file), before);
  } finally { await f.cleanup(); }
});

test('invalid or linked rc fails before MCP writes', async () => {
  for (const kind of ['invalid', 'symlink', 'hardlink']) {
    const f = await fixture();
    try {
      const rc = path.join(f.repo, '.gitnexusrc');
      if (kind === 'invalid') await fs.writeFile(rc, '{broken');
      else {
        const target = path.join(f.repo, 'other.json');
        await fs.writeFile(target, '{}');
        if (kind === 'symlink') await fs.symlink(target, rc);
        else await fs.link(target, rc);
      }
      await assert.rejects(run(f.repo, f.home, []));
      await assert.rejects(fs.access(path.join(f.repo, '.mcp.json')));
      await assert.rejects(fs.access(path.join(f.repo, '.agents')));
    } finally { await f.cleanup(); }
  }
});

test('no-overwrite creation loses concurrent race without modifying winner', async () => {
  const f = await fixture();
  try {
    const plan = await planRepositoryAnalyzeConfig(f.repo, 'create', { scope: 'all', extensions: 'all' });
    await fs.writeFile(path.join(f.repo, '.gitnexusrc'), '{}\n');
    await assert.rejects(() => createRepositoryAnalyzeConfig(plan), /EEXIST/);
    assert.equal(await fs.readFile(path.join(f.repo, '.gitnexusrc'), 'utf8'), '{}\n');
    assert.equal((await fs.readdir(f.repo)).filter((name) => name.endsWith('.tmp')).length, 0);
  } finally { await f.cleanup(); }
});

test('invalid candidate cannot leave a partial final rc', async () => {
  const f = await fixture();
  try {
    const plan = await planRepositoryAnalyzeConfig(f.repo, 'create', { scope: 'all', extensions: 'all' });
    plan.proposed.name = 'invalid`name';
    await assert.rejects(() => createRepositoryAnalyzeConfig(plan), /\.gitnexusrc/);
    await assert.rejects(fs.access(path.join(f.repo, '.gitnexusrc')));
  } finally { await f.cleanup(); }
});

test('interrupted install cleans staging and leaves no final rc', async () => {
  const f = await fixture();
  const originalLink = fs.link;
  try {
    const plan = await planRepositoryAnalyzeConfig(f.repo, 'create', { scope: 'all', extensions: 'all' });
    fs.link = async () => { throw new Error('simulated interruption before install'); };
    await assert.rejects(() => createRepositoryAnalyzeConfig(plan), /simulated interruption/);
    await assert.rejects(fs.access(path.join(f.repo, '.gitnexusrc')));
    assert.equal((await fs.readdir(f.repo)).filter((name) => name.endsWith('.tmp')).length, 0);
  } finally {
    fs.link = originalLink;
    await f.cleanup();
  }
});

test('unknown selection remains pending; metadata bytes do not change after migration', async () => {
  const f = await fixture();
  try {
    const dir = path.join(f.repo, '.gitnexus');
    await fs.mkdir(dir);
    const file = path.join(dir, 'gitnexus.json');
    const raw = JSON.stringify({ repoPath: f.repo, indexCoverage: { scopeRules: ['Assets/'] } });
    await fs.writeFile(file, raw);
    const plan = await planRepositoryAnalyzeConfig(f.repo, 'migrate');
    assert.deepEqual(plan.unresolved, ['includeExtensions']);
    await assert.rejects(run(f.repo, f.home, ['--rc-mode', 'migrate', '--accept-rc']));
    await assert.rejects(fs.access(path.join(f.repo, '.agents')));
    assert.equal(await fs.readFile(file, 'utf8'), raw);
  } finally { await f.cleanup(); }
});

test('coverage-only receipt retains its selections without inventing name or csproj', async () => {
  const f = await fixture();
  try {
    const dir = path.join(f.repo, '.gitnexus');
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, 'gitnexus.json'), JSON.stringify({ repoPath: f.repo,
      indexCoverage: { scopeRules: ['Assets/'], includeExtensions: ['.cs'] },
    }));
    const plan = await planRepositoryAnalyzeConfig(f.repo, 'migrate');
    assert.deepEqual(plan.proposed, { scopeRules: ['Assets/'], includeExtensions: ['.cs'] });
    assert.deepEqual(plan.unresolved, []);
  } finally { await f.cleanup(); }
});

test('global explicit rc request and incomplete create fail before setup writes', async () => {
  const f = await fixture();
  try {
    const env = { ...process.env, HOME: f.home, USERPROFILE: f.home };
    await assert.rejects(exec(process.execPath, [cliPath, 'setup', '--agent', 'opencode',
      '--rc-mode', 'create', '--rc-scope', 'all', '--rc-extensions', 'all', '--accept-rc'],
    { cwd: f.repo, env }));
    await assert.rejects(run(f.repo, f.home, ['--rc-mode', 'create', '--rc-scope', 'all', '--accept-rc']));
    await assert.rejects(fs.access(path.join(f.home, '.gitnexus')));
    await assert.rejects(fs.access(path.join(f.repo, '.agents')));
  } finally { await f.cleanup(); }
});

test('coding-agent route rejects explicit repository rc mode before writes', async () => {
  const f = await fixture();
  try {
    const env = { ...process.env, HOME: f.home, USERPROFILE: f.home };
    await assert.rejects(exec(process.execPath, [cliPath, 'setup', '--coding-agent', 'codex',
      '--rc-mode', 'migrate', '--accept-rc'], { cwd: f.repo, env }));
    await assert.rejects(fs.access(path.join(f.repo, '.gitnexusrc')));
    await assert.rejects(fs.access(path.join(f.home, '.gitnexus')));
  } finally { await f.cleanup(); }
});

test('migration uses the analyzer rc validator for keys, types, names, and paths', () => {
  for (const bad of [
    { unexpected: true },
    { embeddings: 'yes' },
    { name: 'bad`name' },
    { csharpDefineCsproj: '' },
  ]) {
    assert.throws(() => parseAnalyzeConfig(JSON.stringify(bad)), /\.gitnexusrc/);
  }
});

test('scripted legacy migration creates rc and leaves both metadata files byte-identical', async () => {
  const f = await fixture();
  try {
    const dir = path.join(f.repo, '.gitnexus');
    await fs.mkdir(dir);
    await fs.writeFile(path.join(f.repo, 'Assembly-CSharp.csproj'), '<Project/>');
    const raw = JSON.stringify({ repoPath: f.repo, indexedAt: '2025-01-01',
      analyzeOptions: { scopeRules: ['Assets/', 'Packages/'], includeExtensions: ['.cs', '.meta'],
        repoAlias: 'legacy', csharpDefineCsproj: 'Assembly-CSharp.csproj',
        embeddings: true, aiContext: false,
      },
    });
    const primary = path.join(dir, 'gitnexus.json');
    const mirror = path.join(dir, 'meta.json');
    await fs.writeFile(primary, raw);
    await fs.writeFile(mirror, raw);
    const result = await run(f.repo, f.home, ['--rc-mode', 'migrate', '--accept-rc']);
    assert.match(result.stdout, /Analysis config: created/);
    const rc = JSON.parse(await fs.readFile(path.join(f.repo, '.gitnexusrc'), 'utf8'));
    assert.deepEqual(rc.scopeRules, ['Assets/', 'Packages/']);
    assert.deepEqual(rc.includeExtensions, ['.cs', '.meta']);
    assert.equal(rc.name, 'legacy');
    assert.equal(rc.csharpDefineCsproj, 'Assembly-CSharp.csproj');
    assert.equal(rc.embeddings, true);
    assert.equal(rc.skipAgentsMd, true);
    assert.equal(await fs.readFile(primary, 'utf8'), raw);
    assert.equal(await fs.readFile(mirror, 'utf8'), raw);
    await assert.rejects(fs.access(path.join(dir, 'lbug')));
  } finally { await f.cleanup(); }
});

test('skip leaves an invalid rc unread and reports no installed analysis scope', async () => {
  const f = await fixture();
  try {
    await fs.writeFile(path.join(f.repo, '.gitnexusrc'), '{broken');
    const result = await run(f.repo, f.home, ['--rc-mode', 'skip']);
    assert.match(result.stdout, /Analysis config: skipped/);
    assert.doesNotMatch(result.stdout, /Analysis paths:/);
    assert.equal(await fs.readFile(path.join(f.repo, '.gitnexusrc'), 'utf8'), '{broken');
  } finally { await f.cleanup(); }
});
