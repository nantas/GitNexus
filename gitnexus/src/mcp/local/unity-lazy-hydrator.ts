import type { ResolvedUnityBinding } from '../../core/unity/resolver.js';
import type { UnityLazyConfig } from './unity-lazy-config.js';

export interface HydrateLazyBindingsInput {
  pendingPaths: string[];
  config: UnityLazyConfig;
  resolveBatch: (paths: string[]) => Promise<Map<string, ResolvedUnityBinding[]>>;
  dedupeKey?: string;
}

export interface HydrateLazyBindingsOutput {
  resolvedByPath: Map<string, ResolvedUnityBinding[]>;
  timedOut: boolean;
  elapsedMs: number;
  diagnostics: string[];
}

const inFlightHydration = new Map<string, Promise<HydrateLazyBindingsOutput>>();

export async function hydrateLazyBindings(input: HydrateLazyBindingsInput): Promise<HydrateLazyBindingsOutput> {
  if (!input.dedupeKey) {
    return runHydration(input);
  }
  const existing = inFlightHydration.get(input.dedupeKey);
  if (existing) {
    return existing;
  }

  const pending = runHydration(input).finally(() => {
    inFlightHydration.delete(input.dedupeKey!);
  });
  inFlightHydration.set(input.dedupeKey, pending);
  return pending;
}

async function runHydration(input: HydrateLazyBindingsInput): Promise<HydrateLazyBindingsOutput> {
  const pending = input.pendingPaths.slice(0, Math.max(0, input.config.maxPendingPathsPerRequest));
  const batchSize = Math.max(1, input.config.batchSize);
  const startedAt = Date.now();
  const resolvedByPath = new Map<string, ResolvedUnityBinding[]>();
  let timedOut = false;
  const diagnostics: string[] = [];

  for (let i = 0; i < pending.length; i += batchSize) {
    if (Date.now() - startedAt > input.config.maxHydrationMs) {
      timedOut = true;
      break;
    }

    const chunk = pending.slice(i, i + batchSize);
    const resolved = await input.resolveBatch(chunk);
    for (const [resourcePath, bindings] of resolved.entries()) {
      resolvedByPath.set(resourcePath, bindings);
    }
  }

  if (timedOut) {
    diagnostics.push(`lazy-expand budget exceeded after ${Date.now() - startedAt}ms`);
  }

  return {
    resolvedByPath,
    timedOut,
    elapsedMs: Date.now() - startedAt,
    diagnostics,
  };
}
