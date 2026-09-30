import { execFileSync } from 'node:child_process';
import { cp, readFile, writeFile, rename, rm, chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTempDir } from '../helpers/test-db.js';

const packageRoot = path.resolve(__dirname, '../..');
const cli = path.join(packageRoot, 'dist/cli/index.js');

function analyze(repo: string, home: string, force = false, extra: string[] = []): string {
  return execFileSync(
    process.execPath,
    [
      cli,
      'analyze',
      repo,
      '--index-only',
      '--verbose',
      '--workers',
      '1',
      ...(force ? ['--force'] : []),
      ...extra,
    ],
    {
      cwd: packageRoot,
      timeout: 240_000,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITNEXUS_HOME: home,
        GITNEXUS_LANG: 'en',
        GITNEXUS_LBUG_EXTENSION_INSTALL: 'never',
      },
    },
  );
}

// Separate processes own native handles, just as ordinary CLI invocations do.
async function publication(repo: string) {
  const dir = path.join(repo, '.gitnexus');
  const adapter = JSON.stringify(path.join(packageRoot, 'dist/core/lbug/lbug-adapter.js'));
  const script = `import { withLbugDb, executeQuery, closeLbug } from ${adapter};
    const rows = await withLbugDb(${JSON.stringify(path.join(dir, 'lbug'))}, async () => ({
      files: await executeQuery('MATCH (n:File) RETURN n.id AS id ORDER BY id'),
      relations: await executeQuery("MATCH (a)-[r:CodeRelation]->(b) WHERE r.type STARTS WITH 'UNITY_' OR r.type = 'STEP_IN_PROCESS' OR (r.type = 'CALLS' AND a.id STARTS WITH 'Method:unity-runtime-root') RETURN a.id AS source, b.id AS target, r.type AS type, r.reason AS reason, r.step AS step ORDER BY source, target, type, reason, step")
    }), { readOnly: true, skipFts: true });
    console.log(JSON.stringify(rows)); await closeLbug();`;
  const facts = JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: packageRoot,
      encoding: 'utf8',
      timeout: 60_000,
    })
      .trim()
      .split('\n')
      .at(-1)!,
  );
  const meta = JSON.parse(await readFile(path.join(dir, 'gitnexus.json'), 'utf8'));
  return {
    facts,
    hashes: meta.fileHashes,
    seed: JSON.parse(await readFile(path.join(dir, 'unity-parity-seed.json'), 'utf8')),
  };
}

describe('Unity input consistency through real CLI publication', () => {
  it('preserves resource facts, process order and final inventory for an already indexed dirty tree', async () => {
    const repo = await createTempDir('gitnexus-unity-input-');
    const home = await createTempDir('gitnexus-unity-home-');
    try {
      await cp(
        path.join(packageRoot, 'src/core/unity/__fixtures__/mini-unity/Assets'),
        path.join(repo.dbPath, 'Assets'),
        { recursive: true },
      );
      await writeFile(
        path.join(repo.dbPath, '.gitnexusrc'),
        JSON.stringify({ scopeRules: ['Assets/'], includeExtensions: ['.cs', '.meta'] }),
      );
      execFileSync('git', ['init'], { cwd: repo.dbPath, stdio: 'pipe' });
      execFileSync('git', ['add', '.'], { cwd: repo.dbPath, stdio: 'pipe' });
      execFileSync(
        'git',
        [
          '-c',
          'user.name=test',
          '-c',
          'user.email=t@t',
          '-c',
          'commit.gpgsign=false',
          'commit',
          '-m',
          'fixture',
        ],
        { cwd: repo.dbPath, stdio: 'pipe' },
      );
      await writeFile(
        path.join(repo.dbPath, 'Assets/Scripts/PlayerActor.cs'),
        'using UnityEngine;\npublic class PlayerActor : MonoBehaviour { void Start() { Tick(); } void Tick() {} }\n',
      );
      analyze(repo.dbPath, home.dbPath, true);
      const baseline = await publication(repo.dbPath);
      expect(Object.keys(baseline.hashes)).toContain('Assets/Prefabs/PlayerActor.prefab');
      expect(JSON.stringify(baseline.facts)).toContain('UNITY_ASSET_GUID_REF');
      const firstReuse = analyze(repo.dbPath, home.dbPath);
      expect(firstReuse).toContain('Unity inputs: reuse');
      expect(firstReuse).toMatch(/Already up to date/i);
      expect(await publication(repo.dbPath)).toEqual(baseline);
      const second = analyze(repo.dbPath, home.dbPath);
      expect(second).toMatch(/Already up to date|already up.to.date/i);
      expect(await publication(repo.dbPath)).toEqual(baseline);
      expect(second).toContain('Unity inputs: reuse');
      expect(second).not.toMatch(/\[unity-processes\]|Incremental:|Parse cache:/);

      // Legacy metadata may describe a graph already damaged by the old path.
      for (const name of ['gitnexus.json', 'meta.json']) {
        const file = path.join(repo.dbPath, '.gitnexus', name);
        const meta = JSON.parse(await readFile(file, 'utf8'));
        delete meta.unityInputReceipt;
        await writeFile(file, JSON.stringify(meta));
      }
      expect(analyze(repo.dbPath, home.dbPath)).toContain('legacy-repair');
      expect(await publication(repo.dbPath)).toEqual(baseline);

      // A matching content receipt cannot hide interrupted publication work.
      for (const name of ['gitnexus.json', 'meta.json']) {
        const file = path.join(repo.dbPath, '.gitnexus', name);
        const meta = JSON.parse(await readFile(file, 'utf8'));
        meta.incrementalInProgress = true;
        await writeFile(file, JSON.stringify(meta));
      }
      expect(analyze(repo.dbPath, home.dbPath)).not.toMatch(/Already up to date/i);
      expect(await publication(repo.dbPath)).toEqual(baseline);

      // A foreign interrupted embedding checkpoint must fail at the existing
      // identity gate, even though source/resource bytes still match receipt.
      const savedMetadata = new Map<string, string>();
      for (const name of ['gitnexus.json', 'meta.json']) {
        const file = path.join(repo.dbPath, '.gitnexus', name);
        const content = await readFile(file, 'utf8');
        savedMetadata.set(file, content);
        const meta = JSON.parse(content);
        meta.embeddingCheckpoint = {
          at: new Date().toISOString(),
          nodesProcessed: 0,
          totalNodes: 1,
          chunksProcessed: 0,
          model: 'fixture-foreign-model',
          dimensions: 3,
          provider: 'fixture-foreign-provider',
          kind: 'interrupted',
          pendingNodeIds: ['Method:fixture-pending'],
        };
        await writeFile(file, JSON.stringify(meta));
      }
      try {
        expect(() => analyze(repo.dbPath, home.dbPath)).toThrow(
          /Cannot resume embedding checkpoint/,
        );
        expect(await publication(repo.dbPath)).toEqual(baseline);
        const pending = JSON.parse(
          await readFile(path.join(repo.dbPath, '.gitnexus/gitnexus.json'), 'utf8'),
        );
        expect(pending.embeddingCheckpoint.pendingNodeIds).toEqual(['Method:fixture-pending']);
      } finally {
        for (const [file, content] of savedMetadata) await writeFile(file, content);
      }

      // Actual changes must produce the same concrete facts as force analysis.
      const prefab = path.join(repo.dbPath, 'Assets/Prefabs/PlayerActor.prefab');
      const original = await readFile(prefab, 'utf8');
      const mutations = [
        () =>
          writeFile(
            path.join(repo.dbPath, 'Assets/Scripts/PlayerActor.cs'),
            'using UnityEngine; public class PlayerActor : MonoBehaviour { public int score; void Start() { Tick(); } void Tick() {} }',
          ),
        () => writeFile(prefab, original.replace('walkSpeed: 5', 'walkSpeed: 9')),
        () => writeFile(path.join(repo.dbPath, 'Assets/Prefabs/Added.prefab'), original),
        () =>
          rename(
            path.join(repo.dbPath, 'Assets/Prefabs/Added.prefab'),
            path.join(repo.dbPath, 'Assets/Prefabs/Renamed.prefab'),
          ),
        () => rm(path.join(repo.dbPath, 'Assets/Prefabs/Renamed.prefab')),
        () =>
          writeFile(
            path.join(repo.dbPath, 'Assets/Scripts/PlayerActor.cs.meta'),
            'guid: dddddddddddddddddddddddddddddddd',
          ),
        async () => {
          await mkdir(path.join(repo.dbPath, 'Assets/Alternate'), { recursive: true });
          await writeFile(
            path.join(repo.dbPath, 'Assets/Alternate/PlayerActor.cs'),
            'using UnityEngine; public class PlayerActor : MonoBehaviour { void Start() {} }',
          );
          await writeFile(
            path.join(repo.dbPath, 'Assets/Alternate/PlayerActor.cs.meta'),
            'guid: cccccccccccccccccccccccccccccccc',
          );
        },
        async () => {
          await writeFile(
            path.join(repo.dbPath, 'Assets/Scripts/AssetRef.cs'),
            'using System;\n[Serializable]\npublic class AssetRef\n{\n public string address;\n}\n',
          );
          await writeFile(
            path.join(repo.dbPath, 'Assets/Scripts/U2ScriptableConfig.cs'),
            'public class U2ScriptableConfig\n{\n public AssetRef mainUIDocument;\n public object menuScreenList;\n}\n',
          );
        },
      ];
      for (const mutate of mutations) {
        await mutate();
        const log = analyze(repo.dbPath, home.dbPath);
        expect(log).toContain('real-change');
        expect(log).not.toContain('Incremental:');
        const ordinary = await publication(repo.dbPath);
        expect(analyze(repo.dbPath, home.dbPath, true)).not.toMatch(/Already up to date/i);
        expect(await publication(repo.dbPath)).toEqual(ordinary);
      }

      const enriched = await publication(repo.dbPath);
      expect(JSON.stringify(enriched.facts.relations)).toContain('UNITY_SERIALIZED_TYPE_IN');
      expect(enriched.seed.symbolToScriptPath.PlayerActor).toBe('Assets/Alternate/PlayerActor.cs');
      expect(analyze(repo.dbPath, home.dbPath, false, ['--no-parse-cache'])).not.toMatch(
        /Already up to date/i,
      );
      // Git-clean does not prove unchanged Unity resource inputs.
      await writeFile(path.join(repo.dbPath, '.gitignore'), 'Assets/Prefabs/Ignored.prefab\n');
      execFileSync('git', ['add', '.'], { cwd: repo.dbPath, stdio: 'pipe' });
      execFileSync(
        'git',
        [
          '-c',
          'user.name=test',
          '-c',
          'user.email=t@t',
          '-c',
          'commit.gpgsign=false',
          'commit',
          '-m',
          'clean mutation baseline',
        ],
        { cwd: repo.dbPath, stdio: 'pipe' },
      );
      analyze(repo.dbPath, home.dbPath, true);
      await writeFile(path.join(repo.dbPath, 'Assets/Prefabs/Ignored.prefab'), original);
      expect(
        execFileSync('git', ['status', '--porcelain'], {
          cwd: repo.dbPath,
          encoding: 'utf8',
        }).trim(),
      ).toBe('');
      expect(analyze(repo.dbPath, home.dbPath)).toContain('real-change');
      const ignoredResult = await publication(repo.dbPath);
      analyze(repo.dbPath, home.dbPath, true);
      expect(await publication(repo.dbPath)).toEqual(ignoredResult);

      // Read failure must not publish a deletion, a new stamp, or a new DB.
      if (process.platform !== 'win32' && process.getuid?.() !== 0) {
        const before = await publication(repo.dbPath);
        const metaBefore = await readFile(
          path.join(repo.dbPath, '.gitnexus/gitnexus.json'),
          'utf8',
        );
        await chmod(prefab, 0);
        try {
          expect(() => analyze(repo.dbPath, home.dbPath)).toThrow();
        } finally {
          await chmod(prefab, 0o600);
        }
        expect(await publication(repo.dbPath)).toEqual(before);
        expect(await readFile(path.join(repo.dbPath, '.gitnexus/gitnexus.json'), 'utf8')).toBe(
          metaBefore,
        );
      }
      // Readable but unresolvable input must not replace a complete graph.
      const complete = await publication(repo.dbPath);
      const bad = path.join(repo.dbPath, 'Assets/Prefabs/UnreadableRecord.prefab');
      await writeFile(
        bad,
        `--- !u!114 &1\nMonoBehaviour:\n  m_Script: {fileID: 1, guid: abababababababababababababababab, type: 3}\n  target: {fileID: 2, ${' '.repeat(600000)}guid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, type: 3}\n`,
      );
      try {
        expect(() => analyze(repo.dbPath, home.dbPath)).toThrow(/replacement graph is incomplete/);
      } finally {
        await rm(bad);
      }
      expect(await publication(repo.dbPath)).toEqual(complete);
      analyze(repo.dbPath, home.dbPath);

      // Inject failures through the real orchestrator, after initial input
      // capture. The live database and old receipt must survive both cases.
      const main = path.join(repo.dbPath, 'Assets/Scripts/PlayerActor.cs');
      const content = await readFile(main, 'utf8');
      for (const failure of ['input-version', 'replacement']) {
        const before = await publication(repo.dbPath);
        const priorMeta = JSON.parse(
          await readFile(path.join(repo.dbPath, '.gitnexus/gitnexus.json'), 'utf8'),
        );
        const program = `import { runFullAnalysis } from ${JSON.stringify(path.join(packageRoot, 'dist/core/run-analyze.js'))};
          import fs from 'node:fs/promises'; import { appendFileSync } from 'node:fs';
          const failure = ${JSON.stringify(failure)};
          const rename = fs.rename.bind(fs);
          fs.rename = async (source, destination) => {
            if (failure === 'replacement' && String(source).includes('.staging.') && String(destination).endsWith('/lbug')) throw new Error('injected replacement failure');
            return rename(source, destination);
          };
          let mutated = false;
          try {
            await runFullAnalysis(${JSON.stringify(repo.dbPath)}, {force:true, workerCount:1, skipAgentsMd:true, skipSkills:true, skipNativeCloseOnExit:true, scopeRules:['Assets/'], includeExtensions:['.cs','.meta']}, {
              onProgress(phase) { if (failure === 'input-version' && phase === 'lbug' && !mutated) { mutated = true; appendFileSync(${JSON.stringify(main)}, '\\n// concurrent mutation'); } }
            }); console.log('UNEXPECTED_SUCCESS');
          } catch (error) { console.log('EXPECTED_FAILURE:' + error.message); }
          process.exit(0);`;
        const output = execFileSync(process.execPath, ['--input-type=module', '-e', program], {
          cwd: packageRoot,
          encoding: 'utf8',
          timeout: 240_000,
          env: {
            ...process.env,
            GITNEXUS_HOME: home.dbPath,
            GITNEXUS_LBUG_EXTENSION_INSTALL: 'never',
          },
        });
        expect(output).toContain(
          failure === 'input-version'
            ? 'inputs changed during analysis'
            : 'injected replacement failure',
        );
        expect(output).not.toContain('UNEXPECTED_SUCCESS');
        expect(await publication(repo.dbPath)).toEqual(before);
        const failedMeta = JSON.parse(
          await readFile(path.join(repo.dbPath, '.gitnexus/gitnexus.json'), 'utf8'),
        );
        expect(failedMeta.unityInputReceipt).toEqual(priorMeta.unityInputReceipt);
        expect(failedMeta.indexedAt).toEqual(priorMeta.indexedAt);
        await writeFile(main, content);
        analyze(repo.dbPath, home.dbPath);
      }
    } finally {
      await repo.cleanup();
      await home.cleanup();
    }
  }, 600_000);
});
