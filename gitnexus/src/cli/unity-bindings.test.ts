import { describe, it, expect } from 'vitest'

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unityBindingsCommand } from './unity-bindings.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../src/core/unity/__fixtures__/mini-unity');

it('prints human readable summary by default', async () => {
  const lines: string[] = [];

  await unityBindingsCommand(
    'MainUIManager',
    { targetPath: fixtureRoot },
    { writeLine: (line) => lines.push(line) },
  );

  const output = lines.join('\n');
  expect(output).toMatch(/resource bindings/i);
  expect(output).toMatch(/MainUIManager/);
  expect(output).toMatch(/needPause/);
});

it('prints JSON when --json is enabled', async () => {
  const lines: string[] = [];

  await unityBindingsCommand(
    'MainUIManager',
    { targetPath: fixtureRoot, json: true },
    { writeLine: (line) => lines.push(line) },
  );

  const payload = JSON.parse(lines.join('\n')) as {
    symbol: string;
    resourceBindings: unknown[];
    serializedFields: { scalarFields: unknown[]; referenceFields: unknown[] };
  };

  expect(payload.symbol).toBe('MainUIManager');
  expect(Array.isArray(payload.resourceBindings)).toBeTruthy();
  expect(Array.isArray(payload.serializedFields.scalarFields)).toBeTruthy();
  expect(Array.isArray(payload.serializedFields.referenceFields)).toBeTruthy();
});
