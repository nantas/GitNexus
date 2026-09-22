import { describe, it, expect } from 'vitest';
import { loadParser, loadLanguage } from '../../src/core/tree-sitter/parser-loader.js';
import { parseSourceSafe } from '../../src/core/tree-sitter/safe-parse.js';
import type Parser from 'tree-sitter';
let parser: Parser;
const parseContent = (source: string, oldTree?: Parser.Tree) =>
  parseSourceSafe(parser, source, oldTree);
import { SupportedLanguages } from '../../src/config/supported-languages.js';

// Fixture: C# class with Unicode (Chinese) field names and method calls
// This mirrors real-world cases from neonspark/FirearmsPowerUp.cs
const CSHARP_UNICODE_CLASS = `
using System;
using System.Collections.Generic;

namespace GameLogic {
  public class 武器数据 {
    public string 说明;
    public bool 是否携带;
    public List<string> 先决条件 = new List<string>();

    public void 初始化() {
      说明 = "基础武器";
      是否携带 = true;
    }

    public string 获取描述() {
      return 先决条件.Count > 0
        ? 先决条件[0].TrimEnd()
        : 说明;
    }
  }
}
`.trim();

// Fixture: partial class with Unicode fields (like FirearmsPowerUp.cs)
const CSHARP_PARTIAL_CLASS_UNICODE = `
using System;

namespace NEON.Game.PowerUps {
  [Serializable]
  public partial class FirearmsPowerUp {
    public string 说明;
    public bool 是否携带;
  }

  public partial class FirearmsPowerUp {
    public void Apply() {
      var desc = 说明.Trim();
    }
  }
}
`.trim();

describe('C# Unicode identifier support (tree-sitter-c-sharp >= 0.23.1)', () => {
  it('parses C# class with Unicode field names without error', async () => {
    parser = await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);

    const tree = parseContent(CSHARP_UNICODE_CLASS);
    expect(tree.rootNode.hasError).toBe(false);
  });

  it('finds class_declaration nodes in Unicode-heavy file', async () => {
    parser = await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);

    const tree = parseContent(CSHARP_UNICODE_CLASS);
    let classCount = 0;
    function walk(node: any) {
      if (node.type === 'class_declaration') classCount++;
      for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    }
    walk(tree.rootNode);
    expect(classCount).toBeGreaterThanOrEqual(1);
  });

  it('finds method_declaration nodes in Unicode-heavy file', async () => {
    parser = await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);

    const tree = parseContent(CSHARP_UNICODE_CLASS);
    let methodCount = 0;
    function walk(node: any) {
      if (node.type === 'method_declaration') methodCount++;
      for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    }
    walk(tree.rootNode);
    expect(methodCount).toBeGreaterThanOrEqual(2); // 初始化 + 获取描述
  });

  it('parses partial class with Unicode fields without cascading ERROR', async () => {
    parser = await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);

    const tree = parseContent(CSHARP_PARTIAL_CLASS_UNICODE);
    const root = tree.rootNode;
    let usingCount = 0;
    function walk(node: any) {
      if (node.type === 'using_directive') usingCount++;
      for (let i = 0; i < node.childCount; i++) walk(node.child(i));
    }
    walk(root);
    expect(usingCount).toBeGreaterThanOrEqual(1);
  });

  it('does NOT produce ERROR nodes for valid Unicode identifiers (shallow check)', async () => {
    parser = await loadParser();
    await loadLanguage(SupportedLanguages.CSharp);

    const tree = parseContent(CSHARP_UNICODE_CLASS);
    let shallowErrorCount = 0;
    function walkShallow(node: any, depth: number) {
      if (depth > 3) return;
      if (node.type === 'ERROR') shallowErrorCount++;
      for (let i = 0; i < node.childCount; i++) walkShallow(node.child(i), depth + 1);
    }
    walkShallow(tree.rootNode, 0);
    expect(shallowErrorCount).toBe(0);
  });
});
