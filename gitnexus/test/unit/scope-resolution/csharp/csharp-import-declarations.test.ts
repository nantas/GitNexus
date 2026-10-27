import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParsedFile, ParsedImport } from 'gitnexus-shared';
import { extractParsedFile } from '../../../../src/core/ingestion/scope-extractor-bridge.js';
import { csharpProvider } from '../../../../src/core/ingestion/languages/csharp.js';
import { csharpScopeResolver } from '../../../../src/core/ingestion/languages/csharp/scope-resolver.js';
import { setCSharpDefineSymbols } from '../../../../src/core/tree-sitter/csharp-preproc-normalizer.js';
import fs from 'node:fs/promises';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function parse(filePath: string, source: string): ParsedFile {
  const parsed = extractParsedFile(csharpProvider, source, filePath)!;
  expect(parsed).toBeDefined();
  const captureSideChannel = csharpProvider.collectCaptureSideChannel?.(filePath);
  return captureSideChannel === undefined
    ? parsed
    : { ...parsed, captureSideChannel: JSON.parse(JSON.stringify(captureSideChannel)) };
}
function resolve(targetRaw: string, parsedFiles: ParsedFile[], config: unknown = undefined) {
  const parsedImport: ParsedImport = {
    kind: 'namespace',
    localName: '_',
    importedName: '_',
    targetRaw,
  };
  return csharpScopeResolver.resolveImportTarget(
    targetRaw,
    'Assets/Consumer.cs',
    new Set(parsedFiles.map((p) => p.filePath)),
    config,
    { parsedFiles, parsedImport },
  );
}
afterEach(() => setCSharpDefineSymbols(undefined));

describe('C# import targets require indexed declaration evidence', () => {
  it('retains evidence for fresh main-thread extraction without worker serialization', () => {
    const parsed = extractParsedFile(
      csharpProvider,
      'namespace Actual; class Service {}',
      'Assets/Service.cs',
    )!;
    csharpScopeResolver.populateOwners(parsed);
    expect(resolve('Actual.Service', [parsed])).toBe(parsed.filePath);
  });
  it('does not guess when cached declaration evidence is absent', () => {
    const parsed = parse('Assets/Client.cs', 'namespace Local; class Client {}');
    expect(resolve('Notion.Client', [{ ...parsed, captureSideChannel: undefined }])).toBeNull();
  });
  it('loads project configuration without reading external source declarations', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'csharp-config-only-'));
    try {
      await fs.mkdir(path.join(root, 'Library'));
      await fs.writeFile(path.join(root, 'Library/External.cs'), 'namespace Vendor.Logging {}');
      await fs.writeFile(
        path.join(root, 'Game.csproj'),
        '<Project><PropertyGroup><RootNamespace>Game</RootNamespace></PropertyGroup></Project>',
      );
      const reads = vi.spyOn(nodeFs, 'createReadStream');
      const config = (await csharpScopeResolver.loadResolutionConfig!(root)) as {
        csharpConfigs: { rootNamespace: string }[];
        namespaces?: unknown;
      };
      expect(config.csharpConfigs.some((c) => c.rootNamespace === 'Game')).toBe(true);
      expect(config.namespaces).toBeUndefined();
      expect(reads.mock.calls.some(([file]) => String(file).endsWith('.cs'))).toBe(false);
    } finally {
      vi.restoreAllMocks();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it.each([false, true])(
    'does not borrow an external namespace even with truncated evidence (csproj=%s)',
    (project) => {
      const files = [parse('Assets/Logging.cs', 'namespace Game; public class Logging {}')];
      expect(
        resolve('Vendor.Logging', files, {
          csharpConfigs: project ? [{ rootNamespace: 'Game', projectDir: '' }] : [],
          namespaces: { declaredNamespaces: new Set(['Vendor.Logging']), truncated: true },
        }),
      ).toBeNull();
    },
  );
  it('rejects an unrelated same-tail candidate even when another file declares the namespace', () => {
    const files = [
      parse('Assets/Logging.cs', 'namespace Game; public class Logging {}'),
      parse('Assets/Actual.cs', 'namespace Vendor.Logging; public class Logger {}'),
    ];
    expect(resolve('Vendor.Logging', files)).toBeNull();
  });
  it.each([
    ['namespace A.B; public class C {}', 'A.B.C'],
    ['namespace A { namespace B { public class C { public class D {} } } }', 'A.B.C.D'],
    ['namespace A {} namespace B { public class C {} }', 'B.C'],
    ['namespace @event.@class { public class @object {} }', 'event.class.object'],
    ['namespace A {} public class C {}', 'C'],
    ['namespace A /* separator */ . B { public class C {} }', 'A.B.C'],
    ['#if FEATURE\nnamespace A { public class C {} }\n#endif', 'A.C'],
  ])('retains exact type ownership: %s', (source, target) => {
    const filePath = `Assets/${target.split('.').at(-1)}.cs`;
    expect(resolve(target, [parse(filePath, source)])).toBe(filePath);
  });
  it('does not put a global type into an earlier block namespace', () => {
    expect(resolve('A.C', [parse('Assets/C.cs', 'namespace A {} public class C {}')])).toBeNull();
  });
  it('uses the effective preprocessor branch', () => {
    setCSharpDefineSymbols([]);
    const file = parse(
      'Assets/Client.cs',
      '#if ENABLE_VENDOR\nnamespace Vendor;\n#else\nnamespace Game;\n#endif\npublic class Client {}',
    );
    expect(resolve('Vendor.Client', [file])).toBeNull();
    expect(resolve('Game.Client', [file])).toBe('Assets/Client.cs');
  });
  it('retains multi-file namespace and partial type candidates', () => {
    const files = [
      parse('Assets/Shared/One.cs', 'namespace Shared { public partial class Service {} }'),
      parse('Assets/Shared/Two.cs', 'namespace Shared { public partial class Service {} }'),
    ];
    expect(files.map((f) => f.filePath)).toContain(resolve('Shared', files));
  });
  it('does not globally guess targets when unrelated source contains syntax errors', () => {
    const files = [
      parse('Assets/Broken.cs', 'namespace Game; class Broken { void Run( }'),
      parse('Assets/Client.cs', 'namespace Local; class Client {}'),
    ];
    expect(resolve('Notion.Client', files)).toBeNull();
  });
});
