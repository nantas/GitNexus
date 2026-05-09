import { describe, it, expect } from 'vitest';

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  containsPlaceholderText,
  validateAnchorAuthenticity,
  validateReloadAcceptanceArtifact,
} from './reload-v1-acceptance-runner.js';


it('v1 reload acceptance rejects placeholders and missing required segments', async () => {
  const artifact: any = {
    repoPath: process.cwd(),
    runtime_chain: {
      status: 'verified_full',
      hops: [
        { hop_type: 'resource', anchor: 'placeholder:1', snippet: 'placeholder' },
      ],
    },
  };
  const validation = await validateReloadAcceptanceArtifact(artifact);
  expect(validation.ok).toBe(false);
  expect(validation.failures.some((failure) => /placeholder/i.test(failure))).toBe(true);
  expect(validation.failures.some((failure) => /missing required guid_map/i.test(failure))).toBe(true);
  expect(validation.failures.some((failure) => /missing required code_runtime/i.test(failure))).toBe(true);
});

it('v1 anchor authenticity validates file existence, line range, and snippet match', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reload-v1-'));
  const filePath = path.join(tempDir, 'Anchor.cs');
  await fs.writeFile(filePath, 'line one\nneedle line\nline three\n');

  const valid = await validateAnchorAuthenticity(tempDir, {
    anchor: `${filePath}:2`,
    snippet: 'needle line',
  });
  expect(valid).toEqual({ anchor: `${filePath}:2`, valid: true });

  const lineOut = await validateAnchorAuthenticity(tempDir, {
    anchor: `${filePath}:9`,
    snippet: 'needle line',
  });
  expect(lineOut.valid).toBe(false);
  expect(lineOut.reason || '').toMatch(/line out of range/i);

  const mismatch = await validateAnchorAuthenticity(tempDir, {
    anchor: `${filePath}:2`,
    snippet: 'missing snippet',
  });
  expect(mismatch.valid).toBe(false);
  expect(mismatch.reason || '').toMatch(/snippet mismatch/i);
});

it('containsPlaceholderText detects placeholder leakage', () => {
  expect(containsPlaceholderText('TODO later')).toBe(true);
  expect(containsPlaceholderText('real anchor')).toBe(false);
});

it('v1 reload acceptance enforces loader/runtime semantic anchors', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reload-v1-semantic-'));
  const filePath = path.join(tempDir, 'Chain.cs');
  await fs.writeFile(filePath, 'resource line\nguid line\nloader line\nruntime line\n');

  const artifact: any = {
    repoPath: tempDir,
    runtime_chain: {
      status: 'verified_full',
      hops: [
        { hop_type: 'resource', anchor: `${filePath}:1`, snippet: 'resource line', note: 'resource ok' },
        { hop_type: 'guid_map', anchor: `${filePath}:2`, snippet: 'guid line', note: 'guid ok' },
        { hop_type: 'code_loader', anchor: `${filePath}:3`, snippet: 'loader line', note: 'loader ok' },
        { hop_type: 'code_runtime', anchor: `${filePath}:4`, snippet: 'runtime line', note: 'runtime ok' },
      ],
    },
  };

  const validation = await validateReloadAcceptanceArtifact(artifact);
  expect(validation.ok).toBe(false);
  expect(validation.failures.some((failure) => /loader.*curgungraph/i.test(failure))).toBe(true);
  expect(validation.failures.some((failure) => /runtime.*closure/i.test(failure))).toBe(true);
});
