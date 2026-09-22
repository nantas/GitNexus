import { emitGdscriptScopeCaptures, resolveGdscriptImport } from './gdscript/scope.js';
import { SupportedLanguages } from 'gitnexus-shared';
import { defineLanguage } from '../language-provider.js';
import { GDSCRIPT_QUERIES } from '../tree-sitter-queries.js';

export const gdscriptProvider = defineLanguage({
  id: SupportedLanguages.GDScript,
  extensions: ['.gd'],
  entryPointPatterns: [/^_ready$/, /^_process$/, /^_physics_process$/, /^_input$/],
  astFrameworkPatterns: [],
  treeSitterQueries: GDSCRIPT_QUERIES,
  typeConfig: {
    declarationNodeTypes: new Set(),
    extractDeclaration: () => null,
    extractParameter: () => null,
  },
  exportChecker: (_node, name) => !name.startsWith('_'),
  importResolver: (raw, from, ctx) => {
    const target = resolveGdscriptImport(raw, from, ctx.allFilePaths);
    return target ? { kind: 'files', files: [target] } : null;
  },
  emitScopeCaptures: emitGdscriptScopeCaptures,
  interpretTypeBinding: (match) =>
    match['@type-binding.self'] && match['@type-binding.type']
      ? {
          boundName: 'self',
          rawTypeName: match['@type-binding.type'].text,
          source: 'parameter-annotation',
        }
      : null,
  interpretImport: (match) => {
    const targetRaw = match['@import.source']?.text;
    if (!targetRaw) return null;
    const localName = match['@import.name']?.text;
    return localName
      ? { kind: 'namespace', localName, importedName: '*', targetRaw }
      : { kind: 'side-effect', targetRaw };
  },
});
