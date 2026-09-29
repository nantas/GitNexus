import { resourceLines } from './resource-lines.js';
import path from 'node:path';
import { ResourceRecordStore, ResourceStorageError } from './resource-record-store.js';
import { resourceFingerprint, type ResourceFailure } from './resource-session.js';
import type { UnityResourceGuidHit } from './resource-hit-scanner.js';
import type { UnityPrefabSourceRef } from './scan-context.js';

/** Independent script and prefab signals share one physical discovery stream. */
export async function discoverUnityResources(input: {
  repoRoot: string;
  resourceFiles: string[];
  scriptGuids: Iterable<string>;
  assetGuidToPath: Map<string, string>;
  recordBudgetBytes?: number;
}) {
  const sourceRecords = new ResourceRecordStore<UnityPrefabSourceRef>(input.recordBudgetBytes);
  const hits = new Map<string, UnityResourceGuidHit[]>();
  const fingerprints = new Map<string, string>();
  const failures: ResourceFailure[] = [];
  const known = new Map([...input.scriptGuids].map(guid => [guid.toLowerCase(), guid]));
  const metrics = { opens: 0, bytes: 0, resources: 0, durationMs: 0 };
  const started = performance.now();
  try {
    for (const resourcePath of input.resourceFiles) {
      const absolute = path.join(input.repoRoot, resourcePath);
      const resourceType = resourcePath.endsWith('.unity') ? 'scene' : resourcePath.endsWith('.asset') ? 'asset' : 'prefab';
      let reader: AsyncGenerator<string> | undefined;
      try {
        const before = await resourceFingerprint(absolute);
        reader = resourceLines(absolute, undefined, bytes => { metrics.bytes += bytes; });
        metrics.opens++;
        const seen = new Set<string>();
        let inPrefab = false;
        let lineNumber = 0;
        for await (const line of reader) {
          lineNumber++;
          for (const match of line.matchAll(/\bm_Script\s*:\s*\{[^}]*\bguid\s*:\s*([0-9a-f]{32})\b/gi)) {
            const guid = known.get(match[1].toLowerCase());
            if (!guid || seen.has(guid)) continue;
            seen.add(guid);
            const rows = hits.get(guid) || [];
            // Routing hints need no retained source line; resolution records each component's own evidence.
            rows.push({ resourcePath, resourceType, line: lineNumber, lineText: '' });
            hits.set(guid, rows);
          }
          if (resourceType === 'asset') continue;
          if (/^\s*---\s*!u!\d+\s+&/.test(line)) inPrefab = false;
          if (/^\s*PrefabInstance:\s*$/.test(line)) { inPrefab = true; continue; }
          if (!inPrefab) continue;
          const source = line.match(/m_SourcePrefab\s*:\s*\{[^}]*fileID\s*:\s*([^,\s}]+)[^}]*guid\s*:\s*([0-9a-f]{32})[^}]*\}/i);
          if (!source) continue;
          const guid = source[2].toLowerCase();
          const target = input.assetGuidToPath.get(guid);
          if (guid === '0'.repeat(32) || !target?.endsWith('.prefab')) continue;
          await sourceRecords.append({ sourceResourcePath: resourcePath, targetGuid: guid,
            targetResourcePath: target, fileId: source[1], fieldName: 'm_SourcePrefab',
            sourceLayer: resourceType === 'scene' ? 'scene' : 'prefab' });
          inPrefab = false;
        }
        if (await resourceFingerprint(absolute) !== before) throw new Error('Resource changed during discovery.');
        fingerprints.set(resourcePath, before);
        metrics.resources++;
      } catch (error) {
        if (error instanceof ResourceStorageError) throw error;
        failures.push({ resourcePath, capability: 'discovery', message: error instanceof Error ? error.message : String(error) });
      } finally {
        await reader?.return(undefined);
      }
    }
  } catch (error) {
    try { await sourceRecords.close(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Discovery and cleanup failed.'); }
    throw error;
  }
  metrics.durationMs = performance.now() - started;
  return { hits, fingerprints, failures, sourceRecords, metrics };
}
