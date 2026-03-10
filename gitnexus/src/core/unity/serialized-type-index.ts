export interface SerializableTypeIndex {
  serializableSymbols: Set<string>;
  hostFieldTypeHints: Map<string, Map<string, string>>;
}

interface SourceFile {
  filePath: string;
  content: string;
}

const SERIALIZABLE_DECLARATION_PATTERN =
  /(?:\[[^\]]*\bSerializable\b[^\]]*\]\s*)+(?:(?:public|private|protected|internal|static|sealed|abstract|partial)\s+)*(?:class|struct)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
const CLASS_DECLARATION_PATTERN = /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)[^{]*\{/g;
const FIELD_DECLARATION_PATTERN =
  /(?:\[[^\]]+\]\s*)*(?:(?:public|private|protected|internal|static|readonly|volatile|new|sealed|virtual|override|unsafe)\s+)*([A-Za-z_][A-Za-z0-9_<>\[\],\.\?\s]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=[^;]*)?;/g;

export function buildSerializableTypeIndexFromSources(sources: SourceFile[]): SerializableTypeIndex {
  const serializableSymbols = new Set<string>();
  for (const source of sources) {
    SERIALIZABLE_DECLARATION_PATTERN.lastIndex = 0;
    let match = SERIALIZABLE_DECLARATION_PATTERN.exec(source.content);
    while (match) {
      serializableSymbols.add(match[1]);
      match = SERIALIZABLE_DECLARATION_PATTERN.exec(source.content);
    }
  }

  const hostFieldTypeHints = new Map<string, Map<string, string>>();
  for (const source of sources) {
    const classBodies = extractClassBodies(source.content);
    for (const classBody of classBodies) {
      const fieldHints = extractHostFieldHints(classBody.body, serializableSymbols);
      if (fieldHints.size > 0) {
        hostFieldTypeHints.set(classBody.name, fieldHints);
      }
    }
  }

  return { serializableSymbols, hostFieldTypeHints };
}

function extractClassBodies(content: string): Array<{ name: string; body: string }> {
  const result: Array<{ name: string; body: string }> = [];
  CLASS_DECLARATION_PATTERN.lastIndex = 0;
  let match = CLASS_DECLARATION_PATTERN.exec(content);

  while (match) {
    const className = match[1];
    const openBraceIndex = CLASS_DECLARATION_PATTERN.lastIndex - 1;
    const closeBraceIndex = findMatchingBrace(content, openBraceIndex);
    if (closeBraceIndex !== -1) {
      result.push({
        name: className,
        body: content.slice(openBraceIndex + 1, closeBraceIndex),
      });
      CLASS_DECLARATION_PATTERN.lastIndex = closeBraceIndex + 1;
    }
    match = CLASS_DECLARATION_PATTERN.exec(content);
  }

  return result;
}

function findMatchingBrace(content: string, openBraceIndex: number): number {
  let depth = 0;
  for (let index = openBraceIndex; index < content.length; index += 1) {
    const ch = content[index];
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function extractHostFieldHints(classBody: string, serializableSymbols: Set<string>): Map<string, string> {
  const hints = new Map<string, string>();
  FIELD_DECLARATION_PATTERN.lastIndex = 0;
  let match = FIELD_DECLARATION_PATTERN.exec(classBody);

  while (match) {
    const full = match[0] || '';
    if (full.includes('(')) {
      match = FIELD_DECLARATION_PATTERN.exec(classBody);
      continue;
    }

    const declaredType = normalizeDeclaredType(match[1]);
    const fieldName = match[2];
    if (declaredType && serializableSymbols.has(declaredType)) {
      hints.set(fieldName, declaredType);
    }
    match = FIELD_DECLARATION_PATTERN.exec(classBody);
  }

  return hints;
}

function normalizeDeclaredType(input: string): string | null {
  let compact = String(input || '').replace(/\s+/g, '');
  compact = compact.replace(/^global::/, '');
  if (!compact) return null;

  let typeName = compact;

  while (true) {
    const listMatch = typeName.match(
      /^(?:System\.Collections\.Generic\.)?(?:List|IList|IReadOnlyList|IEnumerable|HashSet)<(.+)>$/,
    );
    if (!listMatch) break;
    typeName = listMatch[1];
  }

  if (typeName.endsWith('[]')) {
    typeName = typeName.slice(0, -2);
  }
  if (typeName.endsWith('?')) {
    typeName = typeName.slice(0, -1);
  }

  const genericStart = typeName.indexOf('<');
  if (genericStart !== -1) {
    typeName = typeName.slice(0, genericStart);
  }

  const shortName = typeName.split('.').pop() || '';
  return shortName || null;
}
