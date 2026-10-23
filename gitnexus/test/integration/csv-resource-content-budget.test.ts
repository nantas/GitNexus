import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { streamAllCSVsToDisk, FileContentCache } from '../../src/core/lbug/csv-generator.js';
import { buildTestGraph } from '../helpers/test-graph.js';

let root: string | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = undefined;
});

describe('resource File content respects the scan size budget', () => {
  it('overlaps bounded file reads while preserving CSV row order and content', async () => {
    vi.stubEnv('GITNEXUS_MAX_FILE_SIZE', '512');
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'gn-content-prefetch-'));
    const nodes = Array.from({ length: 40 }, (_, i) => ({
      id: `File:${i}.cs`,
      label: 'File' as const,
      name: `${i}.cs`,
      filePath: `${i}.cs`,
    }));
    await Promise.all(
      nodes.map((node, i) => fs.writeFile(path.join(root!, node.filePath), `class C${i} {}`)),
    );
    const readFile = fs.readFile.bind(fs);
    let active = 0;
    let peak = 0;
    vi.spyOn(fs, 'readFile').mockImplementation((async (
      ...args: Parameters<typeof fs.readFile>
    ) => {
      peak = Math.max(peak, ++active);
      try {
        await new Promise((resolve) => setTimeout(resolve, 2));
        return await readFile(...args);
      } finally {
        active--;
      }
    }) as typeof fs.readFile);
    const result = await streamAllCSVsToDisk(buildTestGraph(nodes), root, path.join(root, 'csv'));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(16);
    const csv = await readFile(result.nodeFiles.get('File')!.csvPath, 'utf8');
    const rows = csv.trim().split('\n').slice(1);
    expect(rows).toHaveLength(nodes.length);
    nodes.forEach((node, i) => {
      expect(rows[i]).toContain(`"${node.id}"`);
      expect(rows[i]).toContain(`class C${i} {}`);
    });
  });

  it('keeps supplemental resource nodes and edges without reading oversized text', async () => {
    vi.stubEnv('GITNEXUS_MAX_FILE_SIZE', '512');
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'gn-resource-content-'));
    await fs.mkdir(path.join(root, 'Assets'));
    await fs.writeFile(path.join(root, 'Assets/large.prefab'), 'x'.repeat(512 * 1024 + 1));
    const source = '// retained source\n'.repeat(1000) + 'class Host {}';
    await fs.writeFile(path.join(root, 'Assets/Host.cs'), source);
    const graph = buildTestGraph(
      [
        {
          id: 'File:Assets/large.prefab',
          label: 'File',
          name: 'large.prefab',
          filePath: 'Assets/large.prefab',
        },
        { id: 'File:Assets/Host.cs', label: 'File', name: 'Host.cs', filePath: 'Assets/Host.cs' },
      ],
      [
        {
          sourceId: 'File:Assets/large.prefab',
          targetId: 'File:Assets/Host.cs',
          type: 'UNITY_ASSET_GUID_REF',
        },
      ],
    );
    const read = vi.spyOn(fs, 'readFile');
    const result = await streamAllCSVsToDisk(graph, root, path.join(root, 'csv'));
    expect(read.mock.calls.some(([file]) => String(file).endsWith('large.prefab'))).toBe(false);
    expect(result.nodeFiles.get('File')?.rows).toBe(2);
    const csv = await fs.readFile(result.nodeFiles.get('File')!.csvPath, 'utf8');
    expect(csv).toContain('"File:Assets/large.prefab","large.prefab","Assets/large.prefab",""');
    expect(csv).toContain(source.replace(/[\r\n\t]+/g, ' '));
    const rels = await fs.readFile(result.relsByPair.get('File|File')!.csvPath, 'utf8');
    expect(rels).toContain('UNITY_ASSET_GUID_REF');
  });

  it('uses byte size and keeps files exactly at the effective limit', async () => {
    vi.stubEnv('GITNEXUS_MAX_FILE_SIZE', '1');
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'gn-content-bytes-'));
    await fs.writeFile(path.join(root, 'boundary.cs'), 'a'.repeat(1024));
    await fs.writeFile(path.join(root, 'unicode.asset'), '中'.repeat(342));
    const cache = new FileContentCache(root);
    expect((await cache.get('boundary.cs')).content.length).toBe(1024);
    expect((await cache.get('unicode.asset')).content).toBe('');
  });

  it('honors an explicit larger limit without truncating accepted files', async () => {
    vi.stubEnv('GITNEXUS_MAX_FILE_SIZE', '1024');
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'gn-content-override-'));
    const content = 'x'.repeat(600 * 1024) + 'tail-marker';
    await fs.writeFile(path.join(root, 'large.cs'), content);
    expect((await new FileContentCache(root).get('large.cs')).content).toBe(content);
  });
});
