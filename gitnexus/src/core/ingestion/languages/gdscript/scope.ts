import path from 'node:path';
import Parser from 'tree-sitter';
import { SupportedLanguages, type CaptureMatch } from 'gitnexus-shared';
import { getLanguageGrammar } from '../../../tree-sitter/parser-loader.js';
import { parseSourceSafe } from '../../../tree-sitter/safe-parse.js';
import { nodeToCapture, syntheticCapture } from '../../utils/ast-helpers.js';

export function resolveGdscriptImport(
  raw: string,
  from: string,
  files: ReadonlySet<string>,
): string | null {
  const target = raw.startsWith('res://')
    ? raw.slice(6)
    : path.posix.normalize(path.posix.join(path.posix.dirname(from), raw));
  return files.has(target) ? target : null;
}

/** Use the worker's parsed tree so captures share the definition parser's ranges. */
export function emitGdscriptScopeCaptures(
  source: string,
  file: string,
  cached?: unknown,
): readonly CaptureMatch[] {
  let tree = cached as Parser.Tree | undefined;
  if (!tree) {
    const parser = new Parser();
    parser.setLanguage(getLanguageGrammar(SupportedLanguages.GDScript)!);
    tree = parseSourceSafe(parser, source, undefined, undefined, file);
  }
  const root = tree.rootNode;
  const out: CaptureMatch[] = [{ '@scope.module': nodeToCapture('@scope.module', root) }];
  const add = (pairs: [string, Parser.SyntaxNode][]) =>
    out.push(Object.fromEntries(pairs.map(([tag, node]) => [tag, nodeToCapture(tag, node)])));
  const className = root.namedChildren
    .find((n) => n.type === 'class_name_statement')
    ?.childForFieldName('name');
  if (className)
    add([
      ['@scope.class', root],
      ['@declaration.class', root],
      ['@declaration.name', className],
    ]);
  const walk = (node: Parser.SyntaxNode) => {
    const name = node.childForFieldName('name');
    if (node.type === 'class_definition' && name)
      add([
        ['@scope.class', node],
        ['@declaration.class', node],
        ['@declaration.name', name],
      ]);
    if (node.type === 'function_definition' && name) {
      add([
        ['@scope.function', node],
        ['@declaration.function', node],
        ['@declaration.name', name],
      ]);
      let owner = node.parent;
      while (owner && owner.type !== 'class_definition' && owner !== root) owner = owner.parent;
      const ownerName = owner === root ? className : owner?.childForFieldName('name');
      if (ownerName)
        out.push({
          '@type-binding.self': syntheticCapture('@type-binding.self', node, 'self'),
          '@type-binding.type': syntheticCapture('@type-binding.type', node, ownerName.text),
        });
    }
    if (node.type === 'extends_statement') {
      const base = node.namedChildren[0]?.namedChildren[0];
      if (base?.type === 'identifier')
        add([
          ['@reference.inherits', base],
          ['@reference.name', base],
        ]);
    }
    if (node.type === 'call') {
      const callee = node.namedChildren[0];
      if (callee?.type === 'identifier') {
        add([
          ['@reference.call.free', node],
          ['@reference.name', callee],
        ]);
        const literal = node.childForFieldName('arguments')?.namedChildren[0];
        if (['preload', 'load'].includes(callee.text) && literal?.type === 'string') {
          const match: Record<string, any> = {
            '@import.statement': nodeToCapture('@import.statement', node),
            '@import.source': syntheticCapture(
              '@import.source',
              literal,
              literal.text.slice(1, -1),
            ),
          };
          const local = node.parent?.childForFieldName('name');
          if (local) match['@import.name'] = nodeToCapture('@import.name', local);
          out.push(match);
        }
      }
    }
    if (node.type === 'attribute') {
      const receiver = node.namedChildren[0];
      const call = node.namedChildren[1];
      const method = call?.type === 'attribute_call' ? call.namedChildren[0] : undefined;
      if (receiver && method)
        add([
          ['@reference.call.member', node],
          ['@reference.name', method],
          ['@reference.receiver', receiver],
        ]);
    }
    for (const child of node.namedChildren) walk(child);
  };
  walk(root);
  return out;
}
