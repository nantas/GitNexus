import { createReadStream } from 'node:fs';

/** Bound retained line buffers, including Unity's enormous serialized scalar lines. */
export async function* resourceLines(file: string, maxLineBytes = 256 * 1024,
  onRead?: (bytes: number) => void, signal?: AbortSignal): AsyncGenerator<string> {
  signal?.throwIfAborted();
  const stream = createReadStream(file, { highWaterMark: 64 * 1024, signal });
  let parts: Buffer[] = [];
  let retained = 0;
  let discardedScalar = false;
  const take = (part: Buffer) => {
    if (discardedScalar) return;
    if (retained + part.length > maxLineBytes) {
      const remaining = Math.max(0, maxLineBytes - retained);
      parts.push(Buffer.from(part.subarray(0, remaining)));
      retained += remaining;
      const prefix = Buffer.concat(parts).toString('utf8');
      // Default lightweight semantics do not consume scalar bodies. Keep only
      // their prefix; script/source and object-reference lines must never truncate.
      if (/^\s*#/.test(prefix) || /^\s*[^:{}]+:\s*[^\s{[]/.test(prefix)
        && !/\bm_(?:Script|SourcePrefab)\s*:/.test(prefix)) {
        discardedScalar = true;
        return;
      }
      throw new Error(`Unity resource line exceeds ${maxLineBytes} bytes and cannot be safely skipped.`);
    }
    // Copy the slice so a tiny tail does not retain an entire stream chunk.
    parts.push(Buffer.from(part)); retained += part.length;
  };
  try {
    for await (const chunk of stream) {
      const buffer = chunk as Buffer;
      onRead?.(buffer.length);
      let start = 0;
      for (let end = buffer.indexOf(10, start); end >= 0; end = buffer.indexOf(10, start)) {
        signal?.throwIfAborted();
        take(buffer.subarray(start, end));
        yield Buffer.concat(parts).toString('utf8').replace(/\r$/, '');
        parts = []; retained = 0; discardedScalar = false;
        start = end + 1;
      }
      if (start < buffer.length) take(buffer.subarray(start));
    }
    if (retained || discardedScalar) yield Buffer.concat(parts).toString('utf8').replace(/\r$/, '');
  } finally { stream.destroy(); }
}
