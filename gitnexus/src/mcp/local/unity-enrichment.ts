import type {
  ResolveOutput,
  ResolvedUnityBinding,
  UnitySerializedFields,
} from '../../core/unity/resolver.js';

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
      };

      const binding: ResolvedUnityBinding = {
        resourcePath: parsed.resourcePath || row?.resourcePath || row?.[0] || '',
        resourceType: parsed.resourceType || inferResourceType(parsed.resourcePath || row?.resourcePath || row?.[0] || ''),
        bindingKind: parsed.bindingKind || 'direct',
        componentObjectId: parsed.componentObjectId || '',
        evidence: parsed.evidence || buildSyntheticEvidence(row),
        serializedFields: parsed.serializedFields || { scalarFields: [], referenceFields: [] },
        resolvedReferences: parsed.resolvedReferences || [],
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
