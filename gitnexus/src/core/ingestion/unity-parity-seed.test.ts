import { describe, it, expect } from 'vitest';

import { buildUnityParitySeed } from './unity-parity-seed.js';

it('buildUnityParitySeed extracts canonical script/guid/resource indexes', () => {
  const seed = buildUnityParitySeed({
    symbolToScriptPaths: new Map([
      ['DoorObj', ['Assets/Code/DoorObj.generated.cs', 'Assets/Code/DoorObj.cs']],
    ]),
    symbolToCanonicalScriptPath: new Map([
      ['DoorObj', 'Assets/Code/DoorObj.cs'],
    ]),
    symbolToScriptPath: new Map([
      ['DoorObj', 'Assets/Code/DoorObj.cs'],
    ]),
    scriptPathToGuid: new Map([
      ['Assets/Code/DoorObj.cs', 'abc123abc123abc123abc123abc123ab'],
    ]),
    guidToResourceHits: new Map([
      ['abc123abc123abc123abc123abc123ab', [
        { resourcePath: 'Assets/Prefabs/Door.prefab', resourceType: 'prefab', line: 12, lineText: 'guid: abc123' },
      ]],
    ]),
    assetGuidToPath: new Map([
      ['asset0000000000000000000000000001', 'Assets/Config/Ref.asset'],
    ]),
    serializableSymbols: new Set(),
    hostFieldTypeHints: new Map(),
    resourceDocCache: new Map(),
  } as any);

  expect(seed.version).toBe(1);
  expect(seed.symbolToScriptPath.DoorObj).toBe('Assets/Code/DoorObj.cs');
  expect(seed.scriptPathToGuid['Assets/Code/DoorObj.cs']).toBe('abc123abc123abc123abc123abc123ab');
  expect(seed.guidToResourcePaths['abc123abc123abc123abc123abc123ab']).toEqual(['Assets/Prefabs/Door.prefab']);
  expect(seed.assetGuidToPath?.asset0000000000000000000000000001).toBe('Assets/Config/Ref.asset');
});
