import { resourceCosts } from './resource-costs.js';
import { ResourceStorageError } from './resource-record-store.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveResourceBindings, type ResourceBindingFact } from './resolver.js';
import type { UnityResourceGuidHit } from './resource-hit-scanner.js';

export interface ResourceSelection {
  resourcePath: string;
  resourceType: UnityResourceGuidHit['resourceType'];
  scriptGuids: readonly string[];
  fingerprint?: string;
}

export interface ResourceFailure {
  resourcePath: string;
  capability: 'discovery' | 'resolution';
  message: string;
}

export async function resourceFingerprint(file: string): Promise<string> {
  const stat = await fs.stat(file, { bigint: true });
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
}

/** Single-use, pull-driven resolution. Consumer suspension suspends the parser. */
export class UnityResourceSession {
  readonly failures: ResourceFailure[] = [];
  readonly costs = resourceCosts();
  private closed = false;
  private started = false;
  private active?: AsyncGenerator<ResourceBindingFact>;
  private readonly cancellation = new AbortController();
  private readonly signal: AbortSignal;

  constructor(private readonly input: {
    repoRoot: string;
    resources: Iterable<ResourceSelection>;
    assetGuidToPath?: Map<string, string>;
    signal?: AbortSignal;
    referenceBudgetBytes?: number;
  }) {
    this.signal = input.signal ? AbortSignal.any([input.signal, this.cancellation.signal]) : this.cancellation.signal;
  }

  async *bindings(): AsyncGenerator<ResourceBindingFact> {
    if (this.started || this.closed) throw new Error('Resource session is single-use and must be open.');
    this.started = true;
    try {
      for (const resource of this.input.resources) {
        if (this.closed) break;
        this.signal.throwIfAborted();
        try {
          const absolute = path.join(this.input.repoRoot, resource.resourcePath);
          const before = await resourceFingerprint(absolute);
          if (resource.fingerprint && resource.fingerprint !== before) {
            throw new Error('Resource changed since discovery.');
          }
          this.active = resolveResourceBindings({
            repoRoot: this.input.repoRoot,
            hit: { ...resource, line: 0, lineText: '' },
            scriptGuids: resource.scriptGuids,
            assetGuidToPath: this.input.assetGuidToPath,
            referenceBudgetBytes: this.input.referenceBudgetBytes ?? 1024 * 1024,
            costs: this.costs,
            signal: this.signal,
          });
          const unresolved = new Set(resource.scriptGuids.map(guid => guid.toLowerCase()));
          for await (const fact of this.active) {
            this.signal.throwIfAborted();
            if (this.closed) break;
            unresolved.delete(fact.scriptGuid);
            yield fact;
          }
          if (!this.closed && await resourceFingerprint(absolute) !== before) {
            throw new Error('Resource changed during resolution.');
          }
          if (!this.closed && unresolved.size) {
            throw new Error(`Discovered script GUIDs have no readable component: ${[...unresolved].join(', ')}.`);
          }
        } catch (error) {
          if (error instanceof ResourceStorageError) throw error;
          if (this.closed) return;
          this.signal.throwIfAborted();
          this.failures.push({ resourcePath: resource.resourcePath, capability: 'resolution',
            message: error instanceof Error ? error.message : String(error) });
        } finally {
          await this.active?.return(undefined);
          this.active = undefined;
        }
      }
    } finally {
      await this.close();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.cancellation.abort();
    await this.active?.return(undefined);
    this.active = undefined;
  }
}
