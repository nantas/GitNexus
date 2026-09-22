import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  writeFixtureRepo,
  runPipelineFromRepo,
  getRelationships,
  findDanglingEdges,
} from './helpers.js';

describe('large Unicode C# ingestion', () => {
  it('keeps containers, ownership and source lines past the parser string-input limit', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-unicode-container-'));
    try {
      const padding = '// 中文 padding 0123456789\r\n'.repeat(2000);
      const source =
        padding +
        '#if ACTIVE\r\npublic class 玩家 {\r\n  public void 启动() { 执行(); }\r\n  public void 执行() {}\r\n}\r\n#else\r\npublic class 不启用 { public void 隐藏() {} }\r\n#endif\r\n';
      expect(source.length).toBeGreaterThan(32768);
      writeFixtureRepo(root, {
        'Game.cs': source,
        'Game.csproj':
          '<Project><PropertyGroup><DefineConstants>ACTIVE</DefineConstants></PropertyGroup></Project>',
      });
      const result = await runPipelineFromRepo(root, () => {}, {
        csharpDefineCsproj: path.join(root, 'Game.csproj'),
      });
      const nodes = [...result.graph.iterNodes()];
      const owner = nodes.find((n) => n.label === 'Class' && n.properties.name === '玩家');
      expect(owner?.properties.startLine).toBe(2001);
      expect(nodes.some((n) => n.properties.name === '不启用')).toBe(false);
      expect(getRelationships(result, 'HAS_METHOD')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: '玩家', target: '启动' }),
          expect.objectContaining({ source: '玩家', target: '执行' }),
        ]),
      );
      expect(getRelationships(result, 'CALLS')).toEqual(
        expect.arrayContaining([expect.objectContaining({ source: '启动', target: '执行' })]),
      );
      expect(findDanglingEdges(result, ['HAS_METHOD'])).toEqual([]);
      expect(result.csharpContainerDiagnostics).toMatchObject({
        missing_container_with_methods: 0,
        root_has_error: 0,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 120000);
});
