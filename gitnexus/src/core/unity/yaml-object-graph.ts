export type UnityObjectType = 'MonoBehaviour' | 'PrefabInstance' | 'GameObject';

export interface UnityObjectBlock {
  objectId: string;
  objectType: UnityObjectType;
  stripped: boolean;
  fields: Record<string, string>;
  rawBody: string;
}

const SUPPORTED_TYPES = new Set<UnityObjectType>(['MonoBehaviour', 'PrefabInstance', 'GameObject']);

export function parseUnityYamlObjects(text: string): UnityObjectBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: UnityObjectBlock[] = [];

  let currentHeader: { objectId: string; stripped: boolean } | null = null;
  let currentBody: string[] = [];

  const flush = () => {
    if (!currentHeader) return;

    const objectType = findObjectType(currentBody);
    if (!objectType) {
      currentHeader = null;
      currentBody = [];
      return;
    }

    blocks.push({
      objectId: currentHeader.objectId,
      objectType,
      stripped: currentHeader.stripped,
      fields: parseFields(currentBody),
      rawBody: currentBody.join('\n'),
    });

    currentHeader = null;
    currentBody = [];
  };

  for (const line of lines) {
    const header = line.match(/^--- !u!\d+ &(\d+)(?:\s+(\w+))?\s*$/);
    if (header) {
      flush();
      currentHeader = {
        objectId: header[1],
        stripped: header[2] === 'stripped',
      };
      continue;
    }

    if (currentHeader) {
      currentBody.push(line);
    }
  }

  flush();
  return blocks;
}

function findObjectType(lines: string[]): UnityObjectType | null {
  for (const line of lines) {
    const match = line.match(/^(MonoBehaviour|PrefabInstance|GameObject):\s*$/);
    if (match && SUPPORTED_TYPES.has(match[1] as UnityObjectType)) {
      return match[1] as UnityObjectType;
    }
  }

  return null;
}

function parseFields(lines: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  const rootIndex = lines.findIndex((line) => /^(MonoBehaviour|PrefabInstance|GameObject):\s*$/.test(line));
  if (rootIndex === -1) return fields;

  let currentKey: string | null = null;
  let currentValue: string[] = [];

  const flush = () => {
    if (!currentKey) return;
    fields[currentKey] = currentValue.join('\n').trim();
    currentKey = null;
    currentValue = [];
  };

  for (const line of lines.slice(rootIndex + 1)) {
    if (!line.trim()) {
      if (currentKey) currentValue.push('');
      continue;
    }

    const topLevelMatch = line.match(/^ {2}(?!-)([^ ][^:]*):(.*)$/);
    if (topLevelMatch) {
      flush();
      currentKey = topLevelMatch[1].trim();
      const inlineValue = topLevelMatch[2].trim();
      if (inlineValue) currentValue.push(inlineValue);
      continue;
    }

    if (currentKey) {
      currentValue.push(stripCommonIndent(line));
    }
  }

  flush();
  return fields;
}

function stripCommonIndent(line: string): string {
  if (line.startsWith('    ')) return line.slice(4);
  return line.trimStart();
}
