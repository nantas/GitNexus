import { describe, it, expect } from 'vitest'

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProfileConfig } from './benchmark-unity.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const packagePath = path.resolve(here, '..', '..', 'package.json');

it('quick profile uses reduced sample limits', () => {
  const c = resolveProfileConfig('quick');
  expect(c.maxSymbols).toBe(10);
  expect(c.maxTasks).toBe(5);
});

it('package scripts include neonspark benchmark commands', async () => {
  const raw = await fs.readFile(packagePath, 'utf-8');
  const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
  const scripts = pkg.scripts || {};
  expect(scripts['benchmark:neonspark:full']).toBeTruthy();
  expect(scripts['benchmark:neonspark:quick']).toBeTruthy();
  expect(scripts['benchmark:neonspark:v2:full']).toBeTruthy();
  expect(scripts['benchmark:neonspark:v2:quick']).toBeTruthy();
});
