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
    MATCH (symbol {id: '${escapedSymbolId}'})-[r:CodeRelation {type: 'UNITY_COMPONENT_INSTANCE'}]->(component:CodeElement)
    RETURN component.filePath AS resourcePath, component.description AS payload
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
        evidence: parsed.evidence || { line: 0, lineText: '' },
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
