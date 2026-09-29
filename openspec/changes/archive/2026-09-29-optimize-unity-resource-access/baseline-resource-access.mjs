// Run from repository root with Node 24. Uses the pinned, unmodified dist baseline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { buildUnityScanContext } from '../../../gitnexus/dist/core/unity/scan-context.js';
import { resolveUnityBindings } from '../../../gitnexus/dist/core/unity/resolver.js';

const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'unity-access-baseline-'));
const resourcePath = 'Assets/Shared.prefab';
const resource = path.join(root, resourcePath);
const guids = ['a'.repeat(32), 'b'.repeat(32)];
const originalStream = fs.createReadStream;
const originalRead = fsp.readFile;
let streams = [];
let reads = 0;
fs.createReadStream = function (...args) {
  const stream = originalStream.apply(this, args);
  if (String(args[0]) === resource) streams.push(stream);
  return stream;
};
fsp.readFile = async function (...args) {
  if (String(args[0]) === resource) reads++;
  return originalRead.apply(this, args);
};
syncBuiltinESMExports();
const reset = () => { streams = []; reads = 0; };
const counters = () => ({ streamOpens: streams.length, streamBytes: streams.reduce((n, s) => n + s.bytesRead, 0), readFileCalls: reads });
try {
  await fsp.mkdir(path.join(root, 'Assets'));
  const paths = [resourcePath];
  for (const [index, symbol] of ['First', 'Second'].entries()) {
    const script = `Assets/${symbol}.cs`;
    await fsp.writeFile(path.join(root, script), `public class ${symbol} : MonoBehaviour {}`);
    await fsp.writeFile(path.join(root, `${script}.meta`), `fileFormatVersion: 2\nguid: ${guids[index]}\n`);
    paths.push(script, `${script}.meta`);
  }
  const body = [guids[0], guids[1], guids[0]].map((guid, index) =>
    `--- !u!114 &${index + 1}\nMonoBehaviour:\n  m_Script: {fileID: 11500000, guid: ${guid}, type: 3}\n  target: {fileID: 1, guid: ${'c'.repeat(32)}, type: 3}\n`,
  ).join('');
  const evidenceLines = body.split('\n').flatMap((line, i) => line.includes('m_Script:') ? [i + 1] : []);
  const results = [];
  for (const large of [false, true]) {
    const text = body + (large ? `#${'x'.repeat(513 * 1024)}\n` : '');
    await fsp.writeFile(resource, text);
    reset();
    const context = await buildUnityScanContext({ repoRoot: root, scopedPaths: paths });
    const discovery = counters();
    assert.deepEqual([...context.guidToResourceHits.values()].map(h => h.length), [1, 1]);
    assert.deepEqual([...context.symbolToCanonicalScriptPath.values()].sort(), ['Assets/First.cs', 'Assets/Second.cs']);
    reset();
    const outputs = [];
    for (const symbol of ['First', 'Second']) outputs.push(await resolveUnityBindings({ repoRoot: root, symbol, scanContext: context }));
    const resolution = counters();
    assert.deepEqual(outputs.map(o => o.resourceBindings.map(b => b.componentObjectId)), [['1', '3'], ['2']]);
    assert.equal(outputs.flatMap(o => o.resourceBindings).filter(b => b.resolvedReferences.some(r => r.guid === 'c'.repeat(32))).length, 3);
    if (large) assert.equal(resolution.streamOpens, 2, 'baseline must expose cross-script rereads');
    else assert.equal(resolution.readFileCalls, 1, 'small baseline shares YAML cache');
    results.push({ large, bytes: Buffer.byteLength(text), discovery, resolution,
      identities: outputs.map(o => ({ symbol: o.symbol, ids: o.resourceBindings.map(b => b.componentObjectId), evidence: o.resourceBindings.map(b => b.evidence.line) })),
      actualScriptLines: evidenceLines,
    });
  }
  console.log(JSON.stringify({ node: process.version, results }, null, 2));
} finally {
  fs.createReadStream = originalStream;
  fsp.readFile = originalRead;
  syncBuiltinESMExports();
  await fsp.rm(root, { recursive: true, force: true });
}
