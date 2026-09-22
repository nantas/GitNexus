import { requireVendoredGrammar } from '../../src/core/tree-sitter/vendored-grammars.js';
import { describe, expect, it } from 'vitest';
import Parser from 'tree-sitter';
import { createRequire } from 'node:module';
import { SupportedLanguages } from '../../src/config/supported-languages.js';
import { GDSCRIPT_QUERIES } from '../../src/core/ingestion/tree-sitter-queries.js';
import { isLanguageAvailable } from '../../src/core/tree-sitter/parser-loader.js';

const require = createRequire(import.meta.url);
const itIfGDScriptAvailable = isLanguageAvailable(SupportedLanguages.GDScript) ? it : it.skip;

describe('GDSCRIPT_QUERIES', () => {
  itIfGDScriptAvailable('can compile against tree-sitter-gdscript and capture core symbols', () => {
    const GDScript = requireVendoredGrammar('tree-sitter-gdscript');
    const parser = new Parser();
    parser.setLanguage(GDScript);

    const query = new Parser.Query(parser.getLanguage(), GDSCRIPT_QUERIES);
    const source = `
class_name DemoNode
extends Node

signal opened
const DEFAULT_PATH = "res://demo.tscn"

func _ready() -> void:
  var scene = preload("res://demo.tscn")
  print(scene)
`;
    const tree = parser.parse(source);
    const matches = query.matches(tree.rootNode);
    const captureNames = matches.flatMap((match) => match.captures.map((capture) => capture.name));

    expect(captureNames).toContain('definition.class');
    expect(captureNames).toContain('definition.function');
    expect(captureNames).toContain('definition.signal');
    expect(captureNames).toContain('definition.const');
    expect(captureNames).toContain('heritage.extends');
    expect(captureNames).toContain('import.source');
    expect(captureNames).toContain('call.name');
  });
});
