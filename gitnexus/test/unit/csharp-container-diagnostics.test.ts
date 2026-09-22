import { describe, expect, it } from 'vitest';
import Parser from 'tree-sitter';
import CSharp from 'tree-sitter-c-sharp/bindings/node/index.js';
import {
  inspectCSharpContainers,
  summarizeCSharpContainers,
} from '../../src/core/tree-sitter/csharp-container-diagnostics.js';
import { parseSourceSafe } from '../../src/core/tree-sitter/safe-parse.js';

describe('C# container audit', () => {
  it('does not classify interface/struct/record methods as missing containers', () => {
    const parser = new Parser();
    parser.setLanguage(CSharp);
    const source =
      'interface I { void Run(); } struct S { public void Run() {} } record R { public void Run() {} } delegate void D(); enum E { A }';
    const tree = parseSourceSafe(parser, source, undefined, undefined, 'Types.cs');
    try {
      const record = inspectCSharpContainers(tree.rootNode, 'Types.cs');
      expect(record.container_counts).toEqual({
        class: 0,
        interface: 1,
        struct: 1,
        record: 1,
        delegate: 1,
        enum: 1,
      });
      expect(record.method_count).toBe(3);
      expect(record.missing_class_with_methods).toBe(true);
      expect(record.missing_container_with_methods).toBe(false);
      expect(record.is_false_positive_likely).toBe(true);
      expect(summarizeCSharpContainers([record]).missing_container_with_methods).toBe(0);
    } finally {
      (tree as any).delete?.();
    }
  });
});
