import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  captureUnityInputSnapshot,
  hashInputFiles,
} from '../../src/core/unity/analysis-input-snapshot.js';

const roots: string[] = [];
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-inputs-'));
  roots.push(root);
  await fs.mkdir(path.join(root, 'Assets'));
  await fs.writeFile(path.join(root, 'Assets/Main.cs'), 'class Main {}');
  await fs.writeFile(path.join(root, 'Assets/Selected.prefab'), '%YAML 1.1\n');
  return root;
}
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
const selection = { scopeRules: ['Assets/'], includeExtensions: ['.cs', '.meta'] };

describe('complete Unity input snapshots', () => {
  it('detects content, additions, large resources, renames and deletions without graph nodes', async () => {
    const root = await fixture();
    const first = await captureUnityInputSnapshot(root, selection);
    expect(first?.reusable).toBe(true);
    expect((await captureUnityInputSnapshot(root, selection))?.receipt).toEqual(first?.receipt);
    await fs.writeFile(path.join(root, 'Assets/Large.prefab'), 'x'.repeat(2 * 1024 * 1024));
    const second = await captureUnityInputSnapshot(root, selection);
    expect(second?.hashes.has('Assets/Large.prefab')).toBe(true);
    expect(second?.receipt.digest).not.toBe(first?.receipt.digest);
    await fs.rename(
      path.join(root, 'Assets/Large.prefab'),
      path.join(root, 'Assets/Renamed.prefab'),
    );
    expect((await captureUnityInputSnapshot(root, selection))?.receipt.digest).not.toBe(
      second?.receipt.digest,
    );
    await fs.rm(path.join(root, 'Assets/Renamed.prefab'));
    expect((await captureUnityInputSnapshot(root, selection))?.receipt).toEqual(first?.receipt);
    const stat = await fs.stat(path.join(root, 'Assets/Main.cs'));
    await fs.writeFile(path.join(root, 'Assets/Main.cs'), 'class Else {}');
    await fs.utimes(path.join(root, 'Assets/Main.cs'), stat.atime, stat.mtime);
    expect((await captureUnityInputSnapshot(root, selection))?.receipt.digest).not.toBe(
      first?.receipt.digest,
    );
  });

  it('covers GUIDs, ignored C# project inputs, external defines, and lifecycle configuration', async () => {
    const root = await fixture();
    const external = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-external-'));
    roots.push(external);
    const project = path.join(external, 'Defines.csproj');
    await fs.writeFile(project, '<Project/>');
    await fs.mkdir(path.join(root, 'Library'));
    await fs.writeFile(path.join(root, '.gitignore'), 'Library/\n');
    await fs.mkdir(path.join(root, '.gitnexus'));
    const opts = { ...selection, csharpDefineCsproj: project };
    let previous = (await captureUnityInputSnapshot(root, opts))!.receipt.digest;
    for (const [file, content] of [
      ['Assets/Main.cs.meta', 'guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      ['Library/Ignored.cs', 'namespace Ignored {}'],
      ['Library/Ignored.csproj', '<Project><RootNamespace>Ignored</RootNamespace></Project>'],
      ['.gitnexus/config.json', '{"unity":{"maxSyntheticEdgesTotal":1}}'],
      [project, '<Project><DefineConstants>DEBUG</DefineConstants></Project>'],
    ]) {
      await fs.writeFile(path.resolve(root, file), content);
      const current = (await captureUnityInputSnapshot(root, opts))!.receipt.digest;
      expect(current).not.toBe(previous);
      previous = current;
    }
  });

  it('tracks the prefab-source switch and invocation-cwd payload configuration', async () => {
    const root = await fixture();
    const invocation = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-invocation-'));
    roots.push(invocation);
    await fs.mkdir(path.join(invocation, '.gitnexus'));
    vi.spyOn(process, 'cwd').mockReturnValue(invocation);
    vi.stubEnv('GITNEXUS_DISABLE_PREFAB_SOURCE_PASS', 'false');
    const original = (await captureUnityInputSnapshot(root, selection))!.receipt.digest;
    vi.stubEnv('GITNEXUS_DISABLE_PREFAB_SOURCE_PASS', 'yes');
    const disabled = (await captureUnityInputSnapshot(root, selection))!.receipt.digest;
    expect(disabled).not.toBe(original);
    vi.stubEnv('GITNEXUS_DISABLE_PREFAB_SOURCE_PASS', '1');
    expect((await captureUnityInputSnapshot(root, selection))!.receipt.digest).toBe(disabled);
    await fs.writeFile(
      path.join(invocation, '.gitnexus/config.json'),
      '{"unity":{"payloadMode":"full"}}',
    );
    expect((await captureUnityInputSnapshot(root, selection))!.receipt.digest).not.toBe(disabled);
  });

  it('honors resource scope and accounts for the current empty-selection fallback', async () => {
    const root = await fixture();
    await fs.mkdir(path.join(root, 'Excluded'));
    await fs.writeFile(path.join(root, 'Excluded/Other.prefab'), 'out of resource scope');
    expect(
      (await captureUnityInputSnapshot(root, selection))?.hashes.has('Excluded/Other.prefab'),
    ).toBe(false);
    await fs.rm(path.join(root, 'Assets/Selected.prefab'));
    expect(
      (await captureUnityInputSnapshot(root, selection))?.hashes.has('Excluded/Other.prefab'),
    ).toBe(true);
  });

  it('fails closed on missing reads and inaccessible subtrees', async () => {
    const root = await fixture();
    await expect(hashInputFiles(root, ['Assets/Main.cs', 'Assets/Missing.prefab'])).rejects.toThrow(
      'input-failure',
    );
    if (process.platform !== 'win32' && process.getuid?.() !== 0) {
      await fs.chmod(path.join(root, 'Assets'), 0);
      try {
        await expect(captureUnityInputSnapshot(root, selection)).rejects.toThrow('input-failure');
      } finally {
        await fs.chmod(path.join(root, 'Assets'), 0o700);
      }
    }
  });

  it('does not opt a non-Unity project into a full rebuild', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nonunity-input-'));
    roots.push(root);
    await fs.writeFile(path.join(root, 'main.ts'), 'export const x = 1;');
    expect(await captureUnityInputSnapshot(root, {})).toBeUndefined();
  });
});
