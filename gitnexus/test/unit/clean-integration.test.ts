import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CLI_PATH = path.resolve('dist/cli/index.js');

async function createMockRepo(tmpDir: string) {
  const gitnexusDir = path.join(tmpDir, '.gitnexus');
  await fs.mkdir(gitnexusDir, { recursive: true });
  await fs.writeFile(
    path.join(gitnexusDir, 'meta.json'),
    JSON.stringify({
      repoPath: tmpDir,
      lastCommit: 'abc1234',
      indexedAt: '2026-05-08T00:00:00.000Z',
    }),
    'utf-8',
  );
  await fs.writeFile(path.join(gitnexusDir, 'lbug'), '', 'utf-8');
  await fs.writeFile(path.join(gitnexusDir, 'sync-manifest.txt'), 'Assets/\n', 'utf-8');
  return gitnexusDir;
}

describe('clean command integration', () => {
  it('removes entire .gitnexus directory including residual sync-manifest.txt', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-clean-test-'));
    const gitnexusDir = await createMockRepo(tmpDir);

    // Initialize git repo so clean finds it
    execSync('git init', { cwd: tmpDir, encoding: 'utf-8' });

    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      execSync(`node ${CLI_PATH} clean --force`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
    } finally {
      process.chdir(origCwd);
    }

    // Assert .gitnexus directory is gone
    await expect(fs.access(gitnexusDir)).rejects.toThrow(/ENOENT|no such file/i);
  });

  it('succeeds without error when .gitnexus does not exist', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-clean-empty-'));

    // Initialize git repo
    execSync('git init', { cwd: tmpDir, encoding: 'utf-8' });

    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const output = execSync(`node ${CLI_PATH} clean --force`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      expect(output).toMatch(/No indexed repository/i);
    } finally {
      process.chdir(origCwd);
    }
  });
});
