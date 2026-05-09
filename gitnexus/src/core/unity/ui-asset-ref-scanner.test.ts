import { describe, it, expect } from 'vitest';

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanUiAssetRefs } from './ui-asset-ref-scanner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(here, '../../../src/core/unity/__fixtures__/mini-unity-ui');

it('scans prefab and asset VisualTreeAsset refs with evidence lines', async () => {
  const refs = await scanUiAssetRefs({ repoRoot: fixtureRoot });

  expect(refs.some(
      (entry) =>
        entry.sourceType === 'prefab'
        && entry.sourcePath === 'Assets/Prefabs/EliteBossScreen.prefab'
        && entry.guid === 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        && entry.line > 0,
    )).toBeTruthy();
  expect(refs.some(
      (entry) =>
        entry.sourceType === 'asset'
        && entry.sourcePath === 'Assets/Config/DressUpScreenConfig.asset'
        && entry.guid === 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        && entry.line > 0,
    )).toBeTruthy();
});

it('parses multiline YAML object refs and supports target guid prefilter', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-ui-asset-scan-'));
  await fs.mkdir(path.join(tempRoot, 'Assets/Prefabs'), { recursive: true });
  await fs.writeFile(
    path.join(tempRoot, 'Assets/Prefabs/MultiLine.prefab'),
    [
      '%YAML 1.1',
      '--- !u!114 &11400000',
      'MonoBehaviour:',
      '  m_ObjectHideFlags: 0',
      '  m_VisualTreeAsset: {',
      '    fileID: 9197481965408888,',
      '    guid: abcdefabcdefabcdefabcdefabcdefab,',
      '    type: 3',
      '  }',
    ].join('\n'),
    'utf-8',
  );

  const refs = await scanUiAssetRefs({
    repoRoot: tempRoot,
    targetGuids: ['abcdefabcdefabcdefabcdefabcdefab'],
  });
  expect(refs.length).toBe(1);
  expect(refs[0].sourcePath).toBe('Assets/Prefabs/MultiLine.prefab');
  expect(refs[0].fieldName).toBe('m_VisualTreeAsset');
  expect(refs[0].guid).toBe('abcdefabcdefabcdefabcdefabcdefab');

  await fs.rm(tempRoot, { recursive: true, force: true });
});
