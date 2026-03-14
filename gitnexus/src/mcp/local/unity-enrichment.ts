import type {
  UnityAssetRefPathReference,
  ResolveOutput,
  ResolvedUnityBinding,
  UnitySerializedFields,
} from '../../core/unity/resolver.js';
import { extractAssetRefPathReferences } from '../../core/unity/resolver.js';

export interface UnityContextPayload extends Pick<ResolveOutput, 'resourceBindings' | 'serializedFields' | 'unityDiagnostics'> {}

export type ExecuteQuery = (query: string) => Promise<any[]>;

export async function loadUnityContext(
  _repoId: string,
  symbolId: string,
  execute: ExecuteQuery,
): Promise<UnityContextPayload> {
  const escapedSymbolId = symbolId.replace(/'/g, "''");
  const rows = await execute(`
    MATCH (symbol {id: '${escapedSymbolId}'})-[r:CodeRelation]->(component:CodeElement)
    WHERE r.type IN ['UNITY_COMPONENT_INSTANCE', 'UNITY_SERIALIZED_TYPE_IN']
    RETURN component.filePath AS resourcePath, component.description AS payload, r.type AS relationType, r.reason AS relationReason
    ORDER BY component.filePath, component.id
  `);

  return projectUnityBindings(rows);
}

export function formatLazyHydrationBudgetDiagnostic(elapsedMs: number): string {
  return `lazy-expand budget exceeded after ${elapsedMs}ms`;
}

export function projectUnityBindings(rows: any[]): UnityContextPayload {
  const resourceBindings: ResolvedUnityBinding[] = [];
  const scalarFields: UnitySerializedFields['scalarFields'] = [];
  const referenceFields: UnitySerializedFields['referenceFields'] = [];
  const unityDiagnostics: string[] = [];

  for (const row of rows) {
    const rawPayload = row?.payload ?? row?.description ?? row?.[1];
    if (typeof rawPayload !== 'string' || rawPayload.length === 0) {
      continue;
    }

    try {
      const parsed = JSON.parse(rawPayload) as Partial<ResolvedUnityBinding> & {
        serializedFields?: UnitySerializedFields;
        resourcePath?: string;
        resourceType?: 'prefab' | 'scene' | 'asset';
        bindingKind?: ResolvedUnityBinding['bindingKind'];
        componentObjectId?: string;
        evidence?: ResolvedUnityBinding['evidence'];
        resolvedReferences?: ResolvedUnityBinding['resolvedReferences'];
        assetRefPaths?: UnityAssetRefPathReference[];
      };

      const lightweight = Boolean((parsed as any).lightweight)
        || (
          String(parsed.componentObjectId || '').startsWith('line-')
          && ((parsed.serializedFields?.scalarFields?.length || 0) === 0)
          && ((parsed.serializedFields?.referenceFields?.length || 0) === 0)
        );

      const binding: ResolvedUnityBinding = {
        resourcePath: parsed.resourcePath || row?.resourcePath || row?.[0] || '',
        resourceType: parsed.resourceType || inferResourceType(parsed.resourcePath || row?.resourcePath || row?.[0] || ''),
        bindingKind: parsed.bindingKind || 'direct',
        componentObjectId: parsed.componentObjectId || '',
        lightweight,
        evidence: parsed.evidence || buildSyntheticEvidence(row),
        serializedFields: parsed.serializedFields || { scalarFields: [], referenceFields: [] },
        resolvedReferences: parsed.resolvedReferences || [],
        assetRefPaths: normalizeAssetRefPaths(parsed.assetRefPaths) || extractAssetRefPathReferences(parsed.serializedFields || { scalarFields: [], referenceFields: [] }),
      };

      resourceBindings.push(binding);
      scalarFields.push(...binding.serializedFields.scalarFields);
      referenceFields.push(...binding.serializedFields.referenceFields);
    } catch (error) {
      unityDiagnostics.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    resourceBindings,
    serializedFields: {
      scalarFields,
      referenceFields,
    },
    unityDiagnostics,
  };
}

function inferResourceType(resourcePath: string): 'prefab' | 'scene' | 'asset' {
  if (resourcePath.endsWith('.prefab')) return 'prefab';
  if (resourcePath.endsWith('.asset')) return 'asset';
  return 'scene';
}

function buildSyntheticEvidence(row: any): ResolvedUnityBinding['evidence'] {
  const relationType = String(row?.relationType || '').trim();
  const relationReason = String(row?.relationReason || '').trim();
  if (!relationType && !relationReason) {
    return { line: 0, lineText: '' };
  }
  return {
    line: 0,
    lineText: relationReason ? `${relationType}:${relationReason}` : relationType,
  };
}

function normalizeAssetRefPaths(input: unknown): UnityAssetRefPathReference[] | undefined {
  if (!Array.isArray(input) || input.length === 0) {
    return undefined;
  }

  const rows: UnityAssetRefPathReference[] = [];
  for (const row of input) {
    if (!row || typeof row !== 'object') continue;
    const parentFieldName = String((row as any).parentFieldName || '').trim();
    const fieldName = String((row as any).fieldName || '').trim();
    const relativePath = String((row as any).relativePath || '');
    const sourceLayer = String((row as any).sourceLayer || 'unknown');
    rows.push({
      parentFieldName: parentFieldName || fieldName || 'unknown',
      fieldName: fieldName || parentFieldName || 'unknown',
      relativePath,
      sourceLayer,
      isEmpty: Boolean((row as any).isEmpty ?? relativePath.length === 0),
      isSprite: Boolean((row as any).isSprite),
    });
  }

  return rows.length > 0 ? rows : undefined;
}
