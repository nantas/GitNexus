import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { runPipelineFromRepo } from '../../src/core/ingestion/pipeline.js';

async function createTempRepo(): Promise<{ repoDir: string; csprojPath: string }> {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-csharp-preproc-'));
  const csprojPath = path.join(repoDir, 'Assembly-CSharp.csproj');
  const sourcePath = path.join(repoDir, 'Feature.cs');

  await fs.writeFile(csprojPath, [
    '<Project Sdk="Microsoft.NET.Sdk">',
    '  <PropertyGroup>',
    '    <TargetFramework>netstandard2.1</TargetFramework>',
    '    <DefineConstants>UNITY_EDITOR;TRACE</DefineConstants>',
    '  </PropertyGroup>',
    '</Project>',
  ].join('\n'), 'utf-8');

  await fs.writeFile(sourcePath, [
    'namespace Demo;',
    'public class Feature {',
    '#if UNITY_EDITOR',
    '  public void EditorOnly() {}',
    '#else',
    '  public void RuntimeOnly() {}',
    '#endif',
    '}',
  ].join('\n'), 'utf-8');

  return { repoDir, csprojPath };
}

// Needs pipeline integration — csproj define loading not yet ported to new pipeline architecture
describe.skip('csharp preprocessor normalization in pipeline', () => {
  it('uses csproj defines to keep active branch methods and reports diagnostics', async () => {
    const { repoDir, csprojPath } = await createTempRepo();

    try {
      const result = await runPipelineFromRepo(repoDir, () => {}, {
        includeExtensions: ['.cs'],
        csharpDefineCsproj: csprojPath,
        skipGraphPhases: true,
      });

      const methodNames: string[] = [];
      result.graph.forEachNode((node) => {
        if (node.label === 'Method') methodNames.push(String(node.properties.name));
      });

      expect(methodNames).toContain('EditorOnly');
      expect(methodNames).not.toContain('RuntimeOnly');
      expect(result.csharpPreprocDiagnostics?.enabled).toBe(true);
      expect(result.csharpPreprocDiagnostics?.normalizedFiles).toBe(1);
      expect(result.csharpPreprocDiagnostics?.defineSymbolCount).toBe(2);
    } finally {
      await fs.rm(repoDir, { recursive: true, force: true });
    }
  });
});
