export interface AssetRefPathInstance {
  fieldName: string;
  relativePath: string;
  isEmpty: boolean;
  isSprite: boolean;
}

interface StructuredAssetRefPathRow {
  fieldName?: string;
  relativePath?: string;
  isEmpty?: boolean;
  isSprite?: boolean;
}

export interface CharacterListAssetRefSpriteSummary {
  extractedAssetRefInstances: number;
  nonEmptyAssetRefInstances: number;
  spriteAssetRefInstances: number;
  spriteRatioInNonEmpty: number | null;
  uniqueSpriteAssets: number;
  byFieldAllNonEmpty: Record<string, number>;
  byFieldSpriteOnly: Record<string, number>;
  topSpritePaths: Record<string, number>;
}

function unquote(input: string): string {
  return input.replace(/^"|"$/g, '');
}

export function isSpriteRelativePath(input: string): boolean {
  const value = input.trim().toLowerCase();
  if (!value) return false;
  if (value.includes('/sprites/')) return true;
  return /\.(png|jpg|jpeg|tga|psd|webp|spriteatlas|spriteatlasv2)$/.test(value);
}

function countBy<T>(rows: T[], keyFn: (row: T) => string): Record<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );
}

export function extractAssetRefPathInstances(bindings: Array<Record<string, any>>): AssetRefPathInstance[] {
  const rows: AssetRefPathInstance[] = [];

  for (const binding of bindings) {
    const structuredRows = Array.isArray(binding?.assetRefPaths) ? binding.assetRefPaths as StructuredAssetRefPathRow[] : [];
    if (structuredRows.length > 0) {
      for (const structured of structuredRows) {
        const relativePath = String(structured.relativePath || '');
        rows.push({
          fieldName: String(structured.fieldName || 'unknown'),
          relativePath,
          isEmpty: Boolean(structured.isEmpty ?? relativePath.length === 0),
          isSprite: Boolean(structured.isSprite ?? isSpriteRelativePath(relativePath)),
        });
      }
      continue;
    }

    const scalarFields = Array.isArray(binding?.serializedFields?.scalarFields)
      ? binding.serializedFields.scalarFields
      : [];
    for (const scalar of scalarFields) {
      const text = String(scalar?.value || '');
      if (!text) continue;

      const lines = text.split(/\r?\n/);
      let currentFieldName = 'unknown';
      for (const line of lines) {
        const fieldMatch = line.match(/^\s*([A-Za-z0-9_]*Ref):\s*$/);
        if (fieldMatch) {
          currentFieldName = fieldMatch[1];
          continue;
        }

        const relativePathMatch = line.match(/^\s*_relativePath:\s*(.*)$/);
        if (!relativePathMatch) continue;

        const relativePath = unquote((relativePathMatch[1] || '').trim());
        rows.push({
          fieldName: currentFieldName,
          relativePath,
          isEmpty: relativePath.length === 0,
          isSprite: isSpriteRelativePath(relativePath),
        });
      }
    }
  }

  return rows;
}

export function summarizeCharacterListAssetRefSprite(bindings: Array<Record<string, any>>): CharacterListAssetRefSpriteSummary {
  const extracted = extractAssetRefPathInstances(bindings);
  const nonEmpty = extracted.filter((row) => !row.isEmpty);
  const spriteOnly = nonEmpty.filter((row) => row.isSprite);

  return {
    extractedAssetRefInstances: extracted.length,
    nonEmptyAssetRefInstances: nonEmpty.length,
    spriteAssetRefInstances: spriteOnly.length,
    spriteRatioInNonEmpty: nonEmpty.length === 0 ? null : Number((spriteOnly.length / nonEmpty.length).toFixed(4)),
    uniqueSpriteAssets: new Set(spriteOnly.map((row) => row.relativePath)).size,
    byFieldAllNonEmpty: countBy(nonEmpty, (row) => row.fieldName),
    byFieldSpriteOnly: countBy(spriteOnly, (row) => row.fieldName),
    topSpritePaths: countBy(spriteOnly, (row) => row.relativePath),
  };
}
