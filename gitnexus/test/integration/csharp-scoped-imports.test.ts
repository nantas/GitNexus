import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deserialize, serialize } from 'node:v8';
import { expect, it } from 'vitest';
import { getRelationships, runPipelineFromRepo, writeFixtureRepo } from './resolvers/helpers.js';
import { PARSE_CACHE_VERSION, type ParseCache } from '../../src/storage/parse-cache.js';

it('links scoped declarations and preserves calls without borrowing external namespace evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'csharp-scoped-imports-'));
  try {
    writeFixtureRepo(root, {
      'Assets/Consumer.cs':
        'using Vendor.Logging; using Notion.Client; using Alias = Vendor.Logging.Logger; class Consumer { void Run() { Logger.Write(); } }',
      'Assets/Vendor/Logging/Logger.cs':
        'namespace Vendor.Logging { public class Logger { public static void Write() {} } }',
      'Assets/Logging.cs': 'namespace Game { class Logging {} }',
      'Assets/Client.cs': 'namespace Local { class Client {} }',
      'Library/PackageCache/External.cs': 'namespace Notion.Client { class External {} }',
    });
    const parseCache: ParseCache = {
      version: PARSE_CACHE_VERSION,
      entries: new Map(),
      usedKeys: new Set(),
    };
    for (const replay of [false, true]) {
      const result = await runPipelineFromRepo(root, () => {}, {
        scopeRules: ['Assets/'],
        includeExtensions: ['.cs'],
        skipGraphPhases: true,
        parseCache,
      });
      if (replay) expect(result.parseCacheHitFileCount).toBe(4);
      const imports = getRelationships(result, 'IMPORTS').filter(
        (e) => e.sourceFilePath === 'Assets/Consumer.cs',
      );
      expect(imports.map((e) => e.targetFilePath)).toContain('Assets/Vendor/Logging/Logger.cs');
      expect(
        imports.some((e) => ['Assets/Logging.cs', 'Assets/Client.cs'].includes(e.targetFilePath)),
      ).toBe(false);
      expect(
        getRelationships(result, 'CALLS').some(
          (e) =>
            e.source === 'Run' &&
            e.target === 'Write' &&
            e.targetFilePath === 'Assets/Vendor/Logging/Logger.cs',
        ),
      ).toBe(true);
      parseCache.entries = deserialize(serialize(parseCache.entries));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 60000);
