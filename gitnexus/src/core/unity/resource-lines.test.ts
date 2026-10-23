import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resourceLineChunks, resourceLines } from './resource-lines.js';

test('short resource lines do not allocate a copied buffer per line', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-lines-'));
  const file = path.join(root, 'input');
  try {
    const expected = Array.from({ length: 1000 }, (_, i) => `  value: ${i}`);
    await fs.writeFile(file, expected.join('\n') + '\n');
    let allocations = 0;
    const from = Buffer.from;
    const concat = Buffer.concat;
    t.mock.method(Buffer, 'from', (...args: any[]) => {
      if (Buffer.isBuffer(args[0])) allocations++;
      return Reflect.apply(from, Buffer, args);
    });
    t.mock.method(Buffer, 'concat', (...args: any[]) => {
      allocations++;
      return Reflect.apply(concat, Buffer, args);
    });
    const actual: string[] = [];
    for await (const line of resourceLines(file)) actual.push(line);
    assert.deepEqual(actual, expected);
    assert.ok(allocations <= 2, `${allocations} buffer allocations for one chunk`);
  } finally {
    t.mock.restoreAll();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('chunk boundaries preserve UTF-8, CRLF, empty lines and unterminated tails', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-lines-'));
  const file = path.join(root, 'input');
  try {
    // Split a multibyte character, then a CRLF pair, at physical read boundaries.
    const text = 'x'.repeat(65535) + '纹\r\n\n' + 'y'.repeat(65530) + '\r\n末尾';
    await fs.writeFile(file, text);
    const actual: string[] = [];
    let bytes = 0;
    for await (const line of resourceLines(file, undefined, (n) => {
      bytes += n;
    }))
      actual.push(line);
    assert.deepEqual(
      actual,
      text.split('\n').map((line) => line.replace(/\r$/, '')),
    );
    assert.equal(bytes, Buffer.byteLength(text));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('resource consumers await chunks rather than individual lines', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-line-chunks-'));
  const file = path.join(root, 'input');
  try {
    const expected = Array.from({ length: 10000 }, (_, i) => `  字段: ${i}`);
    await fs.writeFile(file, expected.join('\n'));
    const actual: string[] = [];
    let chunks = 0;
    for await (const lines of resourceLineChunks(file)) {
      chunks++;
      for (const line of lines) actual.push(line);
    }
    assert.deepEqual(actual, expected);
    assert.ok(chunks < 10, `${chunks} asynchronous chunks for 10,000 lines`);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
