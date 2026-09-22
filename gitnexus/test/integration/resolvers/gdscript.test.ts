import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  writeFixtureRepo,
  runPipelineFromRepo,
  getRelationships,
  getNodesByLabel,
} from './helpers.js';

describe('GDScript scope integration', () => {
  it('retains classes, direct calls, self calls and res imports through the registry pipeline', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-gdscript-'));
    try {
      writeFixtureRepo(root, {
        'game.gd':
          'class_name Game\nconst Helper = preload("res://helper.gd")\nfunc _ready():\n    start()\nfunc tick():\n    self.start()\nfunc start():\n    pass\n',
        'helper.gd': 'class_name Helper\nfunc help():\n    pass\n',
      });
      const result = await runPipelineFromRepo(root, () => {});
      expect(getNodesByLabel(result, 'Class')).toEqual(expect.arrayContaining(['Game', 'Helper']));
      const calls = getRelationships(result, 'CALLS');
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: '_ready', target: 'start' }),
          expect.objectContaining({ source: 'tick', target: 'start' }),
        ]),
      );
      expect(getRelationships(result, 'IMPORTS')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sourceFilePath: 'game.gd', targetFilePath: 'helper.gd' }),
        ]),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 120000);
});
