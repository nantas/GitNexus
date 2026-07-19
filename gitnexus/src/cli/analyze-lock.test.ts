import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { acquireAnalyzeLock, getAnalyzeLockPath } from './analyze-lock.js';

const makeStoragePath = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-analyze-lock-test-'));
  return path.join(root, '.gitnexus');
};

const waitForLine = (child: ChildProcessWithoutNullStreams): Promise<string> => new Promise((resolve, reject) => {
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    const newline = stdout.indexOf('\n');
    if (newline >= 0) resolve(stdout.slice(0, newline).trim());
  });
  child.once('error', reject);
  child.once('exit', (code) => {
    if (!stdout.includes('\n')) reject(new Error(`lock child exited ${code}: ${stderr}`));
  });
});

const waitForSuccess = (child: ChildProcessWithoutNullStreams): Promise<void> => new Promise((resolve, reject) => {
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.once('error', reject);
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`lock child exited ${code}: ${stderr}`)));
});

test('analyze lock serializes contenders for the same repository', async () => {
  const storagePath = await makeStoragePath();
  const first = await acquireAnalyzeLock(storagePath, { pollIntervalMs: 10, timeoutMs: 2_000 });
  let secondAcquired = false;
  const secondPromise = acquireAnalyzeLock(storagePath, { pollIntervalMs: 10, timeoutMs: 2_000 })
    .then((lock) => {
      secondAcquired = true;
      return lock;
    });

  await new Promise((resolve) => setTimeout(resolve, 75));
  assert.equal(secondAcquired, false);

  await first.release();
  const second = await secondPromise;
  assert.equal(secondAcquired, true);
  await second.release();
});

test('analyze lock serializes separate Node processes', async () => {
  const storagePath = await makeStoragePath();
  const moduleUrl = new URL('./analyze-lock.js', import.meta.url).href;
  const childScript = `
    import { acquireAnalyzeLock } from ${JSON.stringify(moduleUrl)};
    const lock = await acquireAnalyzeLock(process.env.GITNEXUS_TEST_STORAGE, { pollIntervalMs: 10, timeoutMs: 2000 });
    process.stdout.write(String(Date.now()) + '\\n');
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.GITNEXUS_TEST_HOLD_MS || 0)));
    await lock.release();
  `;
  const startChild = (holdMs: number) => spawn(
    process.execPath,
    ['--input-type=module', '--eval', childScript],
    {
      env: {
        ...process.env,
        GITNEXUS_TEST_STORAGE: storagePath,
        GITNEXUS_TEST_HOLD_MS: String(holdMs),
      },
    },
  );

  const first = startChild(300);
  const firstAcquiredAt = Number(await waitForLine(first));
  const firstDone = waitForSuccess(first);
  const second = startChild(0);
  const secondAcquiredAt = Number(await waitForLine(second));
  await Promise.all([firstDone, waitForSuccess(second)]);

  assert.ok(secondAcquiredAt - firstAcquiredAt >= 250, 'second process acquired the lock before the first released it');
});

test('analyze lock reclaims a lock owned by a dead process', async () => {
  const storagePath = await makeStoragePath();
  const lockPath = getAnalyzeLockPath(storagePath);
  await fs.mkdir(lockPath, { recursive: true });
  await fs.writeFile(path.join(lockPath, 'owner.json'), JSON.stringify({
    pid: 2_147_483_647,
    token: 'dead-owner',
    startedAt: new Date(0).toISOString(),
  }));

  const lock = await acquireAnalyzeLock(storagePath, { pollIntervalMs: 10, timeoutMs: 2_000 });
  await lock.release();
  await assert.rejects(fs.stat(lockPath), { code: 'ENOENT' });
});

test('analyze lock times out instead of stealing a live lock', async () => {
  const storagePath = await makeStoragePath();
  const first = await acquireAnalyzeLock(storagePath, { pollIntervalMs: 10, timeoutMs: 2_000 });

  await assert.rejects(
    acquireAnalyzeLock(storagePath, { pollIntervalMs: 10, timeoutMs: 75 }),
    /another analyze process/i,
  );

  await first.release();
});
