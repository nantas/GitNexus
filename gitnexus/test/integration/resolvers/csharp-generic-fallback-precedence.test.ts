import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeFixtureRepo, runPipelineFromRepo, getRelationships } from './helpers.js';

describe('C# generic receiver fallback precedence', () => {
  it('prefers a declared return type and uses only one unresolved generic argument as a fallback', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-generic-priority-'));
    try {
      writeFixtureRepo(root, {
        'Actual.cs': 'public class Actual { public void Mark() {} }',
        'Arg.cs': 'public class Arg { public void Mark() {} }',
        'App.cs': `public class App {
          Actual Make<T>() { return new Actual(); }
          void Declared() { var value = Make<Arg>(); value.Mark(); }
          void Engine() { var value = GetComponent<Arg>(); value.Mark(); }
          void Annotated() { Actual value = GetComponent<Arg>(); value.Mark(); }
          void Multiple() { var value = GetPair<Arg, Actual>(); value.Mark(); }
        }`,
      });
      const result = await runPipelineFromRepo(root, () => {});
      const marks = getRelationships(result, 'CALLS').filter((edge) => edge.target === 'Mark');
      const targets = (caller: string) =>
        marks.filter((edge) => edge.source === caller).map((edge) => edge.targetFilePath);
      expect(targets('Declared')).toEqual(['Actual.cs']);
      expect(targets('Engine')).toEqual(['Arg.cs']);
      expect(targets('Annotated')).toEqual(['Actual.cs']);
      expect(targets('Multiple')).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 120000);
});
