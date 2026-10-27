import type { ParsedFile } from 'gitnexus-shared';
import type { SyntaxNode } from '../../utils/ast-helpers.js';

interface ImportDeclarations {
  version: 1;
  namespaces: string[];
  types: string[];
}

// Capture/extraction is synchronous; retain only the pending file, not ASTs.
let pending: { filePath: string; facts: ImportDeclarations } | undefined;
const freshFacts = new WeakMap<ParsedFile, ImportDeclarations>();
const indexes = new WeakMap<readonly ParsedFile[], Map<string, string[]>>();
const typeKinds = new Set([
  'class_declaration',
  'struct_declaration',
  'interface_declaration',
  'record_declaration',
  'enum_declaration',
  'delegate_declaration',
]);

export function recordCsharpImportDeclarations(filePath: string, root: SyntaxNode): void {
  const namespaces = new Set<string>();
  const types = new Set<string>();
  const nameText = (node: SyntaxNode): string =>
    node.type === 'identifier'
      ? node.text.replace(/^@/, '')
      : node.namedChildren
          .filter((child) => child.type !== 'comment')
          .map(nameText)
          .join('.');
  const nameOf = (node: SyntaxNode): string | undefined => {
    const name = node.childForFieldName('name');
    return name && !name.hasError && !name.isMissing ? nameText(name) : undefined;
  };
  const visit = (node: SyntaxNode, namespace: string, owner: string): void => {
    if (
      node.type === 'namespace_declaration' ||
      node.type === 'file_scoped_namespace_declaration'
    ) {
      const name = nameOf(node);
      if (!name) return;
      namespace = namespace ? `${namespace}.${name}` : name;
      const parts = namespace.split('.');
      for (let i = 1; i <= parts.length; i++) namespaces.add(parts.slice(0, i).join('.'));
    } else if (typeKinds.has(node.type)) {
      const name = nameOf(node);
      if (!name) return;
      owner = owner ? `${owner}.${name}` : name;
      types.add([namespace, owner].filter(Boolean).join('.'));
    } else if (
      node.type !== 'compilation_unit' &&
      node.type !== 'declaration_list' &&
      !['preproc_if', 'preproc_elif', 'preproc_else'].includes(node.type)
    ) {
      return;
    }
    let fileNamespace = namespace;
    for (const child of node.namedChildren) {
      visit(child, fileNamespace, owner);
      // File-scoped namespace declarations do not own the following AST nodes.
      if (node.type === 'compilation_unit' && child.type === 'file_scoped_namespace_declaration') {
        fileNamespace = nameOf(child) ?? '';
      }
    }
  };
  visit(root, '', '');
  pending = { filePath, facts: { version: 1, namespaces: [...namespaces], types: [...types] } };
}

export function collectCsharpImportDeclarations(filePath: string): ImportDeclarations | undefined {
  const result = pending?.filePath === filePath ? pending.facts : undefined;
  pending = undefined;
  return result;
}

function storedFacts(parsed: ParsedFile): ImportDeclarations | undefined {
  const value = parsed.captureSideChannel as Partial<ImportDeclarations> | undefined;
  if (value?.version !== 1 || !Array.isArray(value.namespaces) || !Array.isArray(value.types))
    return undefined;
  if (
    !value.namespaces.every((n) => typeof n === 'string') ||
    !value.types.every((n) => typeof n === 'string')
  )
    return undefined;
  return value as ImportDeclarations;
}

export function rememberCsharpImportDeclarations(parsed: ParsedFile): void {
  const facts = storedFacts(parsed) ?? collectCsharpImportDeclarations(parsed.filePath);
  if (facts) freshFacts.set(parsed, facts);
}

export function csharpDeclaredImportTargets(
  files: readonly ParsedFile[],
  target: string,
): readonly string[] {
  let index = indexes.get(files);
  if (!index) {
    index = new Map();
    for (const file of files) {
      const facts = storedFacts(file) ?? freshFacts.get(file);
      if (!facts) continue; // Missing evidence must not enable filename guesses.
      for (const name of new Set([...facts.namespaces, ...facts.types])) {
        const paths = index.get(name) ?? [];
        paths.push(file.filePath);
        index.set(name, paths);
      }
    }
    indexes.set(files, index);
  }
  return index.get(target.replace(/^global::/, '').replace(/@/g, '')) ?? [];
}
