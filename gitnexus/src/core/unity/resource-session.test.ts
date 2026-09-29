import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ResourceRecordStore, ResourceStorageError } from './resource-record-store.js';
import { UnityResourceSession, resourceFingerprint } from './resource-session.js';
import { buildUnityScanContext } from './scan-context.js';
import { resourceLines } from './resource-lines.js';
import { getIndexIncompleteReasons } from '../index-freshness.js';
import { createKnowledgeGraph } from '../graph/graph.js';
import { processUnityResources } from '../ingestion/unity-resource-processor.js';

test('memory and spill preserve facts and clean only owned temporary storage', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-store-test-'));
  try {
    await fs.writeFile(path.join(root, 'another-run'), 'keep');
    const facts = Array.from({ length: 40 }, (_, n) => ({ n, field: '纹理'.repeat(80) }));
    for (const budget of [0, 100000]) {
      const store = new ResourceRecordStore(budget, root);
      try {
        for (const fact of facts) await store.append(fact);
        const actual = [];
        for await (const fact of store.records()) actual.push(fact);
        assert.deepEqual(actual, facts);
        assert.ok(store.metrics.peakMemoryBytes <= budget);
        assert.equal(store.metrics.writtenBytes > 0, budget === 0);
        for await (const _ of store.records()) break;
      } finally { await store.close(); }
      assert.deepEqual(await fs.readdir(root), ['another-run']);
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('spill failure is fatal and never falls back to unbounded memory', async () => {
  const store = new ResourceRecordStore(0, path.join(os.tmpdir(), `nonexistent-${crypto.randomUUID()}`));
  await assert.rejects(store.append({ value: 1 }), ResourceStorageError);
  assert.equal(store.metrics.peakMemoryBytes, 0);
  await store.close();
});

test('valid-JSON temporary record corruption is detected and owned artifacts are removed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-corrupt-store-'));
  const store = new ResourceRecordStore(0, root);
  try {
    await store.append({ n: 1 });
    const [owned] = await fs.readdir(root);
    await fs.writeFile(path.join(root, owned, 'records.ndjson'), '{"n":2}\n');
    await assert.rejects(async () => { for await (const _ of store.records()) {} }, ResourceStorageError);
  } finally {
    await store.close();
    assert.deepEqual(await fs.readdir(root), []);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('pre-aborted resource sessions propagate cancellation without opening files', async () => {
  const controller = new AbortController();
  controller.abort(new Error('test cancellation'));
  const session = new UnityResourceSession({ repoRoot: os.tmpdir(), signal: controller.signal,
    resources: [{ resourcePath: 'not-opened.prefab', resourceType: 'prefab', scriptGuids: ['a'.repeat(32)] }] });
  await assert.rejects(session.bindings().next(), /test cancellation/);
  assert.equal(session.costs.opens, 0);
  await session.close();
});

test('mid-read cancellation stops a source stream', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-stream-cancel-'));
  const controller = new AbortController();
  let bytes = 0;
  try {
    const file = path.join(root, 'Large.prefab');
    await fs.writeFile(file, '# short comment\n'.repeat(100000));
    await assert.rejects(async () => {
      for await (const _ of resourceLines(file, undefined, size => {
        bytes += size;
        controller.abort(new Error('cancel during read'));
      }, controller.signal)) {}
    }, /cancel during read|aborted/);
    assert.ok(bytes <= 64 * 1024);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('early session close cleans spilled references and does not read the next resource', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-close-spill-'));
  const owned: string[] = [];
  const mkdtemp = fs.mkdtemp;
  const spy = t.mock.method(fs, 'mkdtemp', async (prefix: string) => {
    const directory = await mkdtemp(prefix);
    owned.push(directory);
    return directory;
  });
  try {
    const guid = 'a'.repeat(32);
    await fs.writeFile(path.join(root, 'Large.prefab'),
      `--- !u!114 &1\nMonoBehaviour:\n  m_Script: {fileID: 1, guid: ${guid}, type: 3}\n`
      + `  target: {fileID: 2, guid: ${'b'.repeat(32)}, type: 3}\n#${'x'.repeat(600000)}\n`);
    const session = new UnityResourceSession({ repoRoot: root, referenceBudgetBytes: 0,
      resources: ['Large.prefab', 'NeverRead.prefab'].map(resourcePath => ({resourcePath, resourceType: 'prefab' as const, scriptGuids: [guid]})) });
    const iterator = session.bindings();
    assert.equal((await iterator.next()).done, false);
    assert.equal(owned.length, 1);
    // While the consumer is suspended no next resource is opened.
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(session.costs.opens, 1);
    await session.close();
    await iterator.return(undefined);
    assert.equal(session.costs.opens, 1);
    assert.deepEqual(session.failures, []);
    for (const directory of owned) await assert.rejects(fs.access(directory));
  } finally { spy.mock.restore(); await fs.rm(root, { recursive: true, force: true }); }
});

test('cleanup failures remain fatal with their cause', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-cleanup-failure-'));
  const store = new ResourceRecordStore(0, root);
  await store.append({ value: 1 });
  const spy = t.mock.method(fs, 'rm', async () => { throw new Error('injected cleanup failure'); });
  try {
    await assert.rejects(store.close(), (error: unknown) => {
      assert.ok(error instanceof ResourceStorageError);
      assert.ok(error.cause instanceof AggregateError);
      assert.match(error.cause.errors[0].message, /injected cleanup failure/);
      return true;
    });
  } finally { spy.mock.restore(); await fs.rm(root, { recursive: true, force: true }); }
});

test('a cleanup error preserves the original resolution failure', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-error-causes-'));
  const close = ResourceRecordStore.prototype.close;
  t.mock.method(ResourceRecordStore.prototype, 'append', async () => { throw new Error('original record failure'); });
  t.mock.method(ResourceRecordStore.prototype, 'close', async function(this: ResourceRecordStore<unknown>) {
    await close.call(this);
    throw new Error('secondary cleanup failure');
  });
  try {
    const guid = 'a'.repeat(32);
    await fs.writeFile(path.join(root, 'Large.prefab'),
      `--- !u!114 &1\nMonoBehaviour:\n  m_Script: {fileID: 1, guid: ${guid}, type: 3}\n`
      + `  target: {fileID: 2, guid: ${'b'.repeat(32)}, type: 3}\n#${'x'.repeat(600000)}\n`);
    const session = new UnityResourceSession({ repoRoot: root,
      resources: [{ resourcePath: 'Large.prefab', resourceType: 'prefab', scriptGuids: [guid] }] });
    await assert.rejects(session.bindings().next(), (error: unknown) => {
      assert.ok(error instanceof ResourceStorageError);
      assert.ok(error.cause instanceof AggregateError);
      assert.deepEqual(error.cause.errors.map(e => e.message), ['original record failure', 'secondary cleanup failure']);
      return true;
    });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('a discovered script without a parseable component is incomplete, not empty success', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-malformed-resource-'));
  try {
    const guid = 'a'.repeat(32);
    await fs.writeFile(path.join(root, 'Malformed.prefab'), `m_Script: {fileID: 1, guid: ${guid}, type: 3}\n`);
    const session = new UnityResourceSession({ repoRoot: root,
      resources: [{ resourcePath: 'Malformed.prefab', resourceType: 'prefab', scriptGuids: [guid] }] });
    for await (const _ of session.bindings()) assert.fail('No valid component expected');
    assert.equal(session.failures.length, 1);
    assert.match(session.failures[0].message, /no readable component/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('small-branch reads stay bounded when the size hint becomes stale', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-growing-resource-'));
  const file = path.join(root, 'Growing.prefab');
  const stat = fs.stat;
  try {
    await fs.writeFile(file, '# growing scalar\n'.repeat(100000));
    t.mock.method(fs, 'stat', async (...args: any[]) => {
      const result = await (stat as any)(...args);
      return String(args[0]) === file && args[1] === undefined ? { ...result, size: 100 } : result;
    });
    const session = new UnityResourceSession({ repoRoot: root,
      resources: [{ resourcePath: 'Growing.prefab', resourceType: 'prefab', scriptGuids: ['a'.repeat(32)] }] });
    for await (const _ of session.bindings()) assert.fail('No component expected');
    assert.match(session.failures[0].message, /small-parser input budget/);
    assert.ok(session.costs.bytes <= (512 + 64) * 1024);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('fused discovery preserves source-only resources and resolves scripts once', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-discovery-test-'));
  let context: Awaited<ReturnType<typeof buildUnityScanContext>> | undefined;
  try {
    const targetGuid = 'c'.repeat(32);
    await fs.writeFile(path.join(root, 'Target.prefab.meta'), `guid: ${targetGuid}\n`);
    await fs.writeFile(path.join(root, 'Source.unity'),
      `--- !u!1001 &1\nPrefabInstance:\n  m_SourcePrefab: {fileID: 100100000, guid: ${targetGuid}, type: 3}\n`);
    context = await buildUnityScanContext({ repoRoot: root, fuseResourceDiscovery: true,
      scopedPaths: ['Source.unity', 'Target.prefab.meta'], resourceRecordBudgetBytes: 0 });
    const rows = [];
    for await (const row of context.streamPrefabSourceRefs()) rows.push(row);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].targetResourcePath, 'Target.prefab');
    assert.equal(context.resourceAccessMetrics?.opens, 1);
    assert.ok(context.temporaryRecordMetrics!.writtenBytes > 0);
    assert.equal(context.guidToResourceHits.size, 0);
  } finally { await context?.close?.(); await fs.rm(root, { recursive: true, force: true }); }
});

test('session isolates missing and changed resources and closes on early consumption', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-session-test-'));
  const guid = 'a'.repeat(32);
  try {
    const content = `--- !u!114 &1\nMonoBehaviour:\n  m_Script: {fileID: 1, guid: ${guid}, type: 3}\n`;
    await fs.writeFile(path.join(root, 'Changed.prefab'), content);
    const fingerprint = await resourceFingerprint(path.join(root, 'Changed.prefab'));
    await fs.appendFile(path.join(root, 'Changed.prefab'), '# changed\n');
    await fs.writeFile(path.join(root, 'Valid.prefab'), content);
    const resources = ['Missing.prefab', 'Changed.prefab', 'Valid.prefab'].map(resourcePath => ({
      resourcePath, resourceType: 'prefab' as const, scriptGuids: [guid],
      fingerprint: resourcePath === 'Changed.prefab' ? fingerprint : undefined,
    }));
    const session = new UnityResourceSession({ repoRoot: root, resources });
    const facts = [];
    for await (const fact of session.bindings()) facts.push(fact.binding.resourcePath);
    assert.deepEqual(facts, ['Valid.prefab']);
    assert.deepEqual(session.failures.map(f => f.resourcePath), ['Missing.prefab', 'Changed.prefab']);
    const early = new UnityResourceSession({ repoRoot: root, resources: resources.slice(2) });
    for await (const _ of early.bindings()) break;
    await assert.rejects(early.bindings().next(), /single-use/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('large single-component reference sets spill and suspend until consumed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-reference-budget-'));
  const guid = 'a'.repeat(32);
  try {
    const count = 2000;
    const text = `--- !u!114 &1\nMonoBehaviour:\n  m_Script: {fileID: 1, guid: ${guid}, type: 3}\n  targets:\n`
      + Array.from({ length: count }, (_, n) => `    - {fileID: ${n + 1}, guid: ${'b'.repeat(32)}, type: 3}\n`).join('')
      + `  serializedTexture: ${'x'.repeat(700000)}\n`;
    await fs.writeFile(path.join(root, 'Many.prefab'), text);
    const results = [];
    for (const budget of [1024, 2 * 1024 * 1024]) {
      const session = new UnityResourceSession({ repoRoot: root, referenceBudgetBytes: budget,
        resources: [{ resourcePath: 'Many.prefab', resourceType: 'prefab', scriptGuids: [guid] }] });
      const refs = [];
      for await (const fact of session.bindings()) {
        assert.deepEqual(fact.binding.resolvedReferences, []);
        for await (const reference of fact.referenceRecords!) refs.push(reference.fileId);
      }
      assert.equal(refs.length, count);
      assert.equal(session.costs.opens, 1);
      assert.equal(session.costs.bytes, Buffer.byteLength(text));
      assert.ok(session.costs.peakRecordBytes <= budget);
      assert.equal(session.costs.spillWrittenBytes > 0, budget === 1024);
      assert.deepEqual(session.failures, []);
      results.push(refs);
    }
    assert.deepEqual(results[0], results[1]);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('long scalar lines remain bounded while oversized reference lines fail explicitly', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-lines-'));
  try {
    const file = path.join(root, 'input');
    await fs.writeFile(file, `  value: ${'x'.repeat(10000)}\nnext\n`);
    const lines = [];
    for await (const line of resourceLines(file, 1024)) lines.push(line);
    assert.equal(lines.length, 2);
    assert.ok(Buffer.byteLength(lines[0]) <= 1024);
    assert.equal(lines[1], 'next');
    await fs.writeFile(file, `  reference: {fileID: 1, ${' '.repeat(10000)}guid: ${'b'.repeat(32)}}\n`);
    await assert.rejects(async () => { for await (const _ of resourceLines(file, 1024)) {} }, /cannot be safely skipped/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('resource failures reach index completeness without changing legacy metadata behavior', () => {
  const clean = { scopeExtractionReceipt: 1 as const, scopeExtractionFailures: { total: 0, byLanguage: {} } };
  const before = getIndexIncompleteReasons(clean as any);
  assert.ok(!before.includes('unity-resource-analysis-failed'));
  assert.ok(getIndexIncompleteReasons({ ...clean, unityResourceFailures: [
    { resourcePath: 'Bad.prefab', capability: 'resolution', message: 'changed' },
  ] } as any).includes('unity-resource-analysis-failed'));
});

test('processor reads one shared resource twice total and preserves component and summary facts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-processor-resource-'));
  try {
    const graph = createKnowledgeGraph();
    const guids = ['a'.repeat(32), 'b'.repeat(32)];
    for (const [n, symbol] of ['First', 'Second'].entries()) {
      await fs.writeFile(path.join(root, `${symbol}.cs`), `public class ${symbol} : MonoBehaviour {}`);
      await fs.writeFile(path.join(root, `${symbol}.cs.meta`), `guid: ${guids[n]}\n`);
      graph.addNode({ id: symbol, label: 'Class', properties: { name: symbol, filePath: `${symbol}.cs` } });
    }
    await fs.writeFile(path.join(root, 'Shared.prefab'), [guids[0], guids[1], guids[0]].map((guid, n) =>
      `--- !u!114 &${n + 1}${n === 2 ? ' stripped' : ''}\nMonoBehaviour:\n  m_Script: {fileID: 1, guid: ${guid}, type: 3}\n`,
    ).join('') + `#${'x'.repeat(600000)}\n`);
    const result = await processUnityResources(graph, { repoPath: root });
    assert.equal(result.processedSymbols, 2);
    assert.equal(result.componentCount, 3);
    assert.deepEqual(result.resourceFailures, []);
    assert.ok(result.diagnostics.some(d => /resource-resolution: opens=1,/.test(d)));
    assert.ok(result.diagnostics.some(d => /resource-discovery: resources=1, opens=1,/.test(d)));
    const components = [...graph.iterRelationshipsByType('UNITY_COMPONENT_INSTANCE')];
    assert.deepEqual(components.map(e => [e.sourceId, JSON.parse(e.reason).componentObjectId]),
      [['First', '1'], ['Second', '2'], ['First', '3']]);
    const summary = [...graph.iterRelationshipsByType('UNITY_RESOURCE_SUMMARY')].find(e => e.sourceId === 'First')!;
    assert.deepEqual(JSON.parse(summary.reason).bindingKinds, ['direct', 'nested']);
    assert.deepEqual(result.paritySeed?.guidToResourcePaths[guids[0]], ['Shared.prefab']);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
