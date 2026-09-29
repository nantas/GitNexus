import fs, { type FileHandle } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

export class ResourceStorageError extends Error {
  constructor(message: string, cause: unknown) { super(message, { cause }); }
}

/** Append then replay. A unique owned directory is never reused by another run. */
export class ResourceRecordStore<T> {
  private memory: string[] = [];
  private memoryBytes = 0;
  private directory?: string;
  private writer?: FileHandle;
  private sealed = false;
  private closed = false;
  private count = 0;
  private readonly digest = createHash('sha256');
  readonly metrics = { peakMemoryBytes: 0, writtenBytes: 0, readBytes: 0, writeMs: 0, readMs: 0 };

  constructor(private readonly budgetBytes = 4 * 1024 * 1024,
    private readonly tempRoot = os.tmpdir()) {
    if (!Number.isSafeInteger(budgetBytes) || budgetBytes < 0) throw new Error('Invalid record budget.');
  }

  async append(value: T): Promise<void> {
    if (this.closed || this.sealed) throw new Error('Record store is not writable.');
    const row = JSON.stringify(value) + '\n';
    // UTF-16 retained strings plus a conservative per-row overhead.
    const retainedBytes = row.length * 2 + 64;
    try {
      if (!this.writer && this.memoryBytes + retainedBytes <= this.budgetBytes) {
        this.memory.push(row);
        this.memoryBytes += retainedBytes;
        this.metrics.peakMemoryBytes = Math.max(this.metrics.peakMemoryBytes, this.memoryBytes);
        this.count++;
        return;
      }
      if (!this.writer) {
        this.directory = await fs.mkdtemp(path.join(this.tempRoot, 'gitnexus-unity-records-'));
        this.writer = await fs.open(path.join(this.directory, 'records.ndjson'), 'wx', 0o600);
        for (const old of this.memory) await this.write(old);
        this.memory = [];
        this.memoryBytes = 0;
      }
      await this.write(row);
      this.count++;
    } catch (error) { throw new ResourceStorageError('Cannot preserve Unity temporary records.', error); }
  }

  private async write(row: string): Promise<void> {
    const started = performance.now();
    try { await this.writer!.writeFile(row, 'utf8'); }
    finally { this.metrics.writeMs += performance.now() - started; }
    this.digest.update(row);
    this.metrics.writtenBytes += Buffer.byteLength(row);
  }

  async *records(): AsyncGenerator<T> {
    if (this.closed) throw new Error('Record store is closed.');
    this.sealed = true;
    if (!this.writer) {
      for (const row of this.memory) yield JSON.parse(row) as T;
      return;
    }
    const stream = createReadStream(path.join(this.directory!, 'records.ndjson'), { encoding: 'utf8' });
    const reader = createInterface({ input: stream, crlfDelay: Infinity });
    let count = 0;
    const digest = createHash('sha256');
    const iterator = reader[Symbol.asyncIterator]();
    try {
      while (true) {
        // Exclude the consumer's suspension time from temporary read cost.
        const started = performance.now();
        const next = await iterator.next().finally(() => { this.metrics.readMs += performance.now() - started; });
        if (next.done) break;
        const row = next.value;
        this.metrics.readBytes += Buffer.byteLength(row) + 1;
        count++;
        digest.update(row + '\n');
        yield JSON.parse(row) as T;
      }
      if (count !== this.count || digest.digest('hex') !== this.digest.copy().digest('hex')) {
        throw new Error('Temporary record checksum/count mismatch.');
      }
    } catch (error) { throw new ResourceStorageError('Cannot replay Unity temporary records.', error); }
    finally { reader.close(); stream.destroy(); }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.memory = [];
    this.memoryBytes = 0;
    const errors: unknown[] = [];
    try { await this.writer?.close(); } catch (error) { errors.push(error); }
    try { if (this.directory) await fs.rm(this.directory, { recursive: true, force: true }); }
    catch (error) { errors.push(error); }
    if (errors.length) throw new ResourceStorageError('Cannot clean owned Unity temporary records.', new AggregateError(errors));
  }
}
