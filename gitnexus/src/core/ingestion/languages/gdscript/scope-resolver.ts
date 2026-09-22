import { SupportedLanguages } from 'gitnexus-shared';
import type { ScopeResolver } from '../../scope-resolution/contract/scope-resolver.js';
import { buildMro, defaultLinearize } from '../../scope-resolution/passes/mro.js';
import { populateClassOwnedMembers } from '../../scope-resolution/scope/walkers.js';
import { gdscriptProvider } from '../gdscript.js';
import { resolveGdscriptImport } from './scope.js';

export const gdscriptScopeResolver: ScopeResolver = {
  language: SupportedLanguages.GDScript,
  languageProvider: gdscriptProvider,
  importEdgeReason: 'gdscript-scope: preload/load',
  resolveImportTarget: (raw, from, files) => resolveGdscriptImport(raw, from, files),
  mergeBindings: (existing, incoming) => (existing.length ? [...existing] : [...incoming]),
  arityCompatibility: () => 'unknown',
  buildMro: (graph, files, lookup) => buildMro(graph, files, lookup, defaultLinearize),
  populateOwners: populateClassOwnedMembers,
  isSuperReceiver: (text) => text === 'super',
};
