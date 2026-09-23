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

describe('C# generic callee names that collide with unrelated classes', () => {
  it.each([false, true])(
    'keeps receiver types and targets with streaming=%s',
    async (streamGraphEmit) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-generic-collision-'));
      const csvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-generic-collision-csv-'));
      try {
        writeFixtureRepo(root, {
          'Models.cs': `namespace Demo;
          public class Arg { public void Mark() {} }
          public class Actual { public void Mark() {} }
          public class Empty {}`,
          'Collision.cs': `namespace Unrelated;
          public class GetComponent { public void Mark() {} }
          public class Make { public void Mark() {} }
          public class T { public void Mark() {} }`,
          'App.cs': `namespace Demo;
          public class App : UnityEngine.MonoBehaviour {
            Actual Make<T>() { return new Actual(); }
            void Declared() { var value = Make<Arg>(); value.Mark(); }
            void Bare() { var value = GetComponent<Arg>(); value.Mark(); }
            void ThisMember() { var value = this.GetComponent<Arg>(); value.Mark(); }
            void Member(UnityEngine.GameObject obj) { var value = obj.GetComponent<Arg>(); value.Mark(); }
            void Chained() { var value = Instantiate().GetComponent<Arg>(); value.Mark(); }
            void Alias() { var value = GetComponent<Arg>(); var alias = value; alias.Mark(); }
            void Missing() { var value = GetComponent<MissingArg>(); value.Mark(); }
            void MissingMember() { var value = GetComponent<Empty>(); value.Mark(); }
            void TypeParameter<T>() { var value = GetComponent<T>(); value.Mark(); }
            void Annotated() { Actual value = GetComponent<Arg>(); value.Mark(); }
            void Multiple() { var value = GetPair<Arg, Actual>(); value.Mark(); }
          }`,
        });
        const result = await runPipelineFromRepo(root, () => {}, {
          streamGraphEmit,
          graphEmitCsvDir: csvDir,
        });
        // Check concrete owners. The streaming result exposes finalized CSVs;
        // its resident graph no longer contains the emitted CALLS.
        const targets = new Map<string, string[]>();
        const collect = (sourceId: string, targetId: string, type: string) => {
          if (type !== 'CALLS') return;
          const source = result.graph.getNode(sourceId);
          const target = result.graph.getNode(targetId);
          if (target?.properties.name !== 'Mark' || !source) return;
          const list = targets.get(source.properties.name) ?? [];
          list.push(targetId);
          targets.set(source.properties.name, list);
        };
        if (streamGraphEmit) {
          const csv = fs.readFileSync(path.join(csvDir, 'rel_Method_Method.csv'), 'utf8');
          // These fixture IDs contain no quotes or commas.
          for (const row of csv.split('\n')) {
            const cells = /^"([^"]*)","([^"]*)","([^"]*)",/.exec(row);
            if (cells) collect(cells[1]!, cells[2]!, cells[3]!);
          }
        } else {
          result.graph.forEachRelationshipFields(collect);
        }
        for (const caller of ['Bare', 'ThisMember', 'Member', 'Chained', 'Alias']) {
          expect(targets.get(caller), caller).toEqual(['Method:Models.cs:Arg.Mark#0']);
        }
        for (const caller of ['Declared', 'Annotated']) {
          expect(targets.get(caller), caller).toEqual(['Method:Models.cs:Actual.Mark#0']);
        }
        for (const caller of ['Multiple', 'Missing', 'MissingMember', 'TypeParameter']) {
          expect(targets.get(caller) ?? [], caller).toEqual([]);
        }
        expect([...targets.values()].flat().some((id) => id.includes('Collision.cs'))).toBe(false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(csvDir, { recursive: true, force: true });
      }
    },
    120000,
  );
});
