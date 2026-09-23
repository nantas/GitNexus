import { describe, it, expect } from 'vitest';
import { normalizeCSharpPreprocessorBranches } from '../../src/core/tree-sitter/csharp-preproc-normalizer.js';

describe('normalizeCSharpPreprocessorBranches', () => {
  it('keeps the matching #if branch and strips inactive branches', () => {
    const source = [
      'class Demo {',
      '#if FOO',
      '  void UseFoo() {}',
      '#elif BAR',
      '  void UseBar() {}',
      '#else',
      '  void UseDefault() {}',
      '#endif',
      '}',
    ].join('\n');

    const out = normalizeCSharpPreprocessorBranches(source, new Set(['FOO']));
    expect(out.normalizedText).toContain('void UseFoo() {}');
    expect(out.normalizedText).not.toContain('void UseBar() {}');
    expect(out.normalizedText).not.toContain('void UseDefault() {}');
    expect(out.changed).toBe(true);
  });

  it('handles nested #if/#else blocks using the provided define set', () => {
    const source = [
      '#if OUTER',
      'int x = 1;',
      '#if INNER',
      'int y = 2;',
      '#else',
      'int y = 3;',
      '#endif',
      '#else',
      'int x = 0;',
      '#endif',
    ].join('\n');

    const out = normalizeCSharpPreprocessorBranches(source, new Set(['OUTER']));
    expect(out.normalizedText).toContain('int x = 1;');
    expect(out.normalizedText).toContain('int y = 3;');
    expect(out.normalizedText).not.toContain('int y = 2;');
    expect(out.normalizedText).not.toContain('int x = 0;');
  });

  it('treats undefined symbols as false and falls back to #else branch', () => {
    const source = ['#if UNITY_EDITOR', 'int mode = 1;', '#else', 'int mode = 0;', '#endif'].join(
      '\n',
    );

    const out = normalizeCSharpPreprocessorBranches(source, new Set());
    expect(out.normalizedText).toContain('int mode = 0;');
    expect(out.normalizedText).not.toContain('int mode = 1;');
    expect(out.diagnostics.undefinedSymbols).toEqual(['UNITY_EDITOR']);
  });

  it('preserves source line count for stable diagnostics mapping', () => {
    const source = ['line-1', '#if FLAG', 'line-3', '#else', 'line-5', '#endif', 'line-7'].join(
      '\n',
    );

    const out = normalizeCSharpPreprocessorBranches(source, new Set(['FLAG']));
    expect(out.normalizedText.split('\n').length).toBe(source.split('\n').length);
    expect(out.normalizedText.split('\n')[2]).toBe('line-3');
    expect(out.normalizedText.split('\n')[4]).toBe(' '.repeat('line-5'.length));
  });
});

describe('preprocessSource offset contract', () => {
  it('preserves every offset and mixed newline while masking Unicode branches', () => {
    const source = '#if OFF\r\n中文字段😀;\n#else\ractive();\r\n#endif\n';
    const { normalizedText } = normalizeCSharpPreprocessorBranches(source, new Set());
    expect(normalizedText.length).toBe(source.length);
    expect(normalizedText.indexOf('active();')).toBe(source.indexOf('active();'));
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '\r' || source[i] === '\n') expect(normalizedText[i]).toBe(source[i]);
    }
    expect(normalizeCSharpPreprocessorBranches(normalizedText, new Set()).normalizedText).toBe(
      normalizedText,
    );
  });

  it('consumes both operands even when boolean evaluation short-circuits', () => {
    for (const expression of ['true || false', 'false && true']) {
      const result = normalizeCSharpPreprocessorBranches(
        `#if ${expression}\nyes\n#else\nno\n#endif`,
        new Set(),
      );
      expect(result.diagnostics.expressionErrors).toBe(0);
      expect(result.normalizedText.includes('yes')).toBe(expression.startsWith('true'));
    }
  });
});

describe('directive lexical context', () => {
  it.each([
    '/*#if OFF\nclass Hidden { void Ghost() {} }\n#endif */',
    '/*\n#if OFF\n*/\nclass Visible {}',
    'var text = @"\n#if OFF\n";\nclass Visible {}',
    'var text = """\n#if OFF\n""";\nclass Visible {}',
    'var text = "/*"; // /*\n/*\n#endif */',
  ])('preserves directive-looking text inside comments and literals: %s', (source) => {
    const out = normalizeCSharpPreprocessorBranches(source, new Set());
    expect(out.normalizedText).toBe(source);
    expect(out.diagnostics.directivesSeen).toBe(0);
  });

  it('does not let disabled source comments swallow the matching endif', () => {
    const source = '#if OFF\n/*\n#endif\nclass Visible {}';
    const out = normalizeCSharpPreprocessorBranches(source, new Set());
    expect(out.normalizedText).toContain('class Visible {}');
    expect(out.diagnostics.unterminatedIfBlocks).toBe(0);
  });

  it('resumes directives after a block comment closes', () => {
    const source = '/*\n#if OFF\n*/\n#if ON\nclass Visible {}\n#else\nclass Hidden {}\n#endif';
    const out = normalizeCSharpPreprocessorBranches(source, new Set(['ON']));
    expect(out.normalizedText).toContain('class Visible {}');
    expect(out.normalizedText).not.toContain('class Hidden {}');
    expect(out.diagnostics.directivesSeen).toBe(3);
  });
});

describe('interpolated literal lexical context', () => {
  it.each([
    '$@"{ "/*" }"',
    '$@"{ 1:/* }"',
    '$@"{ (true ? "/*" : "//") }"',
    '$@"{ global::System.String.Empty }"',
    '@$"{ "/*" }"',
    '$"{ "/*" }"',
    '$@"{ $"{ "/*" }" }"',
    '$@"{{literal}} { new[] { "/*", "//" }[0] }"',
    '$@"{ /* comment */ "/*" // line comment\n }"',
    '$$"""text {{ "/*" }} text"""',
    '$"""{ """/*""" }"""',
  ])('resumes real directives after %s', (literal) => {
    const source = `class C {\r\n string s = ${literal};\r\n#if NEVER\r\n void Ghost() {}\r\n#endif\r\n void Visible() {}\r\n}`;
    const out = normalizeCSharpPreprocessorBranches(source, new Set());
    expect(out.diagnostics.directivesSeen).toBe(2);
    expect(out.diagnostics.inactiveLines).toBe(1);
    expect(out.normalizedText).not.toContain('Ghost');
    expect(out.normalizedText).toContain(literal);
    expect(out.normalizedText.indexOf('void Visible')).toBe(source.indexOf('void Visible'));
    expect(out.normalizedText.length).toBe(source.length);
  });

  it('keeps directive-like text in nested multiline literals and resumes after them', () => {
    const literal = '$@"{ @"\n#if NEVER\n" }\n#endif\n"';
    const source = `class C { string s = ${literal};\n#if NEVER\nvoid Ghost() {}\n#endif\n}`;
    const out = normalizeCSharpPreprocessorBranches(source, new Set());
    expect(out.normalizedText).toContain(literal);
    expect(out.normalizedText).not.toContain('Ghost');
    expect(out.diagnostics.directivesSeen).toBe(2);
  });
});
