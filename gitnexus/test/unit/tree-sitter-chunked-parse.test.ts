import { describe, it, expect } from 'vitest';
import { loadParser, loadLanguage } from '../../src/core/tree-sitter/parser-loader.js';
import { parseSourceSafe } from '../../src/core/tree-sitter/safe-parse.js';
import type Parser from 'tree-sitter';
let parser: Parser;
const parseContent = (source: string, oldTree?: Parser.Tree) =>
  parseSourceSafe(parser, source, oldTree);
import { SupportedLanguages } from '../../src/config/supported-languages.js';

describe('safe parse (bounded UTF-16 chunks)', () => {
  it('exports parseContent function', async () => {
    expect(typeof parseContent).toBe('function');
  });

  it('parses simple C# content without error', async () => {
    parser = await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);
    const code = `
namespace MyApp {
  public class Foo {
    public void Bar() {}
  }
}
`;
    const tree = parseContent(code);
    expect(tree).toBeDefined();
    expect(tree.rootNode).toBeDefined();
    expect(tree.rootNode.hasError).toBe(false);
  });

  it('does not throw on large file (> 36 KB)', async () => {
    parser = await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);
    // Generate ~40 KB synthetic C# content
    const lines: string[] = ['namespace BigFile {', '  public class BigClass {'];
    for (let i = 0; i < 1000; i++) {
      lines.push(`    public void Method${i}() { int x = ${i}; }`);
    }
    lines.push('  }', '}');
    const largeCode = lines.join('\n');
    expect(largeCode.length).toBeGreaterThan(36 * 1024);

    let tree: any;
    expect(() => {
      tree = parseContent(largeCode);
    }).not.toThrow();
    expect(tree).toBeDefined();
    expect(tree.rootNode.type).toBe('compilation_unit');
  });

  it('accepts optional oldTree parameter', async () => {
    parser = await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);
    const code = 'namespace A { public class B {} }';
    const tree1 = parseContent(code);
    // Incremental parse with oldTree — should not throw
    expect(() => parseContent(code, tree1)).not.toThrow();
  });
});

describe('parseContent edge cases', () => {
  it('handles empty string without throwing', async () => {
    parser = await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);
    expect(() => parseContent('')).not.toThrow();
  });

  it('handles legacy chunk-boundary-sized content (4096 bytes)', async () => {
    parser = await loadParser();
    await loadLanguage(SupportedLanguages.TypeScript);
    // Generate content of exactly 4096 bytes. This used to be a callback
    // chunk boundary; keep it covered to prevent regressions around boundary
    // sized input.
    const content = 'const x = 1;\n'.repeat(Math.ceil(4096 / 14)).slice(0, 4096);
    expect(() => parseContent(content)).not.toThrow();
  });

  it('handles content with multi-byte UTF-8 characters (Chinese comments)', async () => {
    parser = await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);
    // Chinese characters are 3 bytes each in UTF-8 — stress tests slice boundaries
    const code = `
// 这是一个测试文件，包含大量中文注释以测试 UTF-8 多字节字符在分块边界处的处理
namespace 测试命名空间 {
  public class 测试类 {
    // 这个方法用于测试中文标识符
    public void 测试方法() {
      string 变量名 = "中文字符串";
    }
  }
}
`;
    const tree = parseContent(code);
    expect(tree).toBeDefined();
    // Should not have cascading top-level errors
    expect(tree.rootNode.hasError).toBe(false);
  });

  it('uses bounded UTF-16 chunks for large multi-byte UTF-8 content', async () => {
    parser = await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);

    const comments = Array.from(
      { length: 12_000 },
      (_, index) =>
        `    // 第 ${index} 行：中文注释用于验证 byte offset 不会被 JS string index 误用`,
    ).join('\n');
    const code = `
namespace Utf8Stress {
  public class LargeUtf8Class {
${comments}
    public void Done() {}
  }
}
`;

    expect(Buffer.byteLength(code, 'utf8')).toBeGreaterThan(code.length);
    expect(Buffer.byteLength(code, 'utf8')).toBeGreaterThan(512 * 1024);
    expect(() => parseContent(code)).not.toThrow();
  });
});
