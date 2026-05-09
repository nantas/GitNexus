import { describe, it, expect } from 'vitest'

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

it('cli --version matches package.json version', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(here, '..', '..');
  const cliPath = path.join(packageRoot, 'dist', 'cli', 'index.js');
  const packageJsonPath = path.join(packageRoot, 'package.json');

  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8')) as { version: string };
  const { stdout } = await execFileAsync(process.execPath, [cliPath, '--version'], {
    cwd: packageRoot,
  });

  expect(stdout.trim()).toBe(packageJson.version);
});
