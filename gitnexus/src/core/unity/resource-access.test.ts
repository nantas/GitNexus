import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import nativeFs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { buildUnityScanContext } from './scan-context.js';
import { resolveUnityBindings, resolveResourceBindings } from './resolver.js';
import { UnityResourceSession } from './resource-session.js';

for (const large of [false, true]) {
  test(`each ${large ? 'large' : 'small'} resource component carries its own script evidence`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-resource-evidence-'));
    try {
      const guid = 'abcdefabcdefabcdefabcdefabcdefab';
      await fs.writeFile(path.join(root, 'Carrier.cs'), 'public class Carrier : MonoBehaviour {}');
      await fs.writeFile(path.join(root, 'Carrier.cs.meta'), `guid: ${guid}\n`);
      const text = [
        '--- !u!114 &-11 stripped', 'MonoBehaviour:',
        `  m_Script: {fileID: 11500000, guid: ${guid.toUpperCase()}, type: 3}`,
        `  target: {fileID: 1, guid: ${'c'.repeat(32)}, type: 3}`,
        '--- !u!114 &22', 'MonoBehaviour:',
        `  m_Script: {fileID: 11500000, guid: ${guid}, type: 3}`,
        `  target: {fileID: 2, guid: ${'d'.repeat(32)}, type: 3}`,
        large ? `#${'x'.repeat(513 * 1024)}` : '',
      ].join('\n');
      await fs.writeFile(path.join(root, 'Shared.prefab'), text);
      const scanContext = await buildUnityScanContext({ repoRoot: root,
        scopedPaths: ['Carrier.cs', 'Carrier.cs.meta', 'Shared.prefab'] });
      assert.equal(scanContext.guidToResourceHits.get(guid)?.length, 1);
      const result = await resolveUnityBindings({ repoRoot: root, symbol: 'Carrier', scanContext });
      assert.deepEqual(result.resourceBindings.map(b => b.componentObjectId), ['-11', '22']);
      assert.deepEqual(result.resourceBindings.map(b => b.bindingKind), ['nested', 'direct']);
      assert.deepEqual(result.resourceBindings.map(b => b.evidence.line), [3, 7]);
      assert.deepEqual(result.resourceBindings.map(b => b.evidence.lineText), [text.split('\n')[2], text.split('\n')[6]]);
      assert.deepEqual(result.resourceBindings.map(b => b.resolvedReferences[0].guid), ['c'.repeat(32), 'd'.repeat(32)]);
      assert.ok(result.resourceBindings.every(b => Boolean(b.lightweight) === large));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}

for (const large of [false, true]) {
  test(`resource parser shares one semantic read for different scripts (${large ? 'large' : 'small'})`, async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-resource-reuse-'));
    try {
      const guids = ['a'.repeat(32), 'b'.repeat(32)];
      for (const [index, symbol] of ['First', 'Second'].entries()) {
        await fs.writeFile(path.join(root, `${symbol}.cs`), `public class ${symbol} : MonoBehaviour {}`);
        await fs.writeFile(path.join(root, `${symbol}.cs.meta`), `guid: ${guids[index]}\n`);
      }
      const body = [guids[0], guids[1], guids[0]].map((guid, index) =>
        `--- !u!114 &${index + 1}\nMonoBehaviour:\n  m_Script: {fileID: 11500000, guid: ${guid}, type: 3}\n`,
      ).join('') + (large ? `#${'x'.repeat(513 * 1024)}\n` : '');
      const resource = path.join(root, 'Shared.prefab');
      await fs.writeFile(resource, body);
      const context = await buildUnityScanContext({ repoRoot: root });
      const hit = context.guidToResourceHits.get(guids[0])![0];
      assert.equal(context.guidToResourceHits.get(guids[0])!.length, 1);
      let opens = 0;
      const originalStream = nativeFs.createReadStream;
      const originalRead = fs.readFile;
      t.mock.method(nativeFs, 'createReadStream', (...args: Parameters<typeof nativeFs.createReadStream>) => {
        if (String(args[0]) === resource) opens++;
        return originalStream(...args);
      });
      t.mock.method(fs, 'readFile', async (...args: any[]) => {
        if (String(args[0]) === resource) opens++;
        return (originalRead as any)(...args);
      });
      syncBuiltinESMExports();
      const facts = [];
      const session = new UnityResourceSession({ repoRoot: root,
        resources: [{ resourcePath: hit.resourcePath, resourceType: hit.resourceType, scriptGuids: guids }] });
      for await (const fact of session.bindings()) {
        facts.push([fact.scriptGuid, fact.binding.componentObjectId, fact.binding.evidence.line]);
      }
      assert.equal(opens, 1);
      assert.deepEqual(session.failures, []);
      assert.deepEqual(facts, [[guids[0], '1', 3], [guids[1], '2', 6], [guids[0], '3', 9]]);
    } finally {
      t.mock.restoreAll();
      syncBuiltinESMExports();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}
