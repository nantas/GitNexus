interface ConditionalFrame {
  parentActive: boolean;
  branchTaken: boolean;
  currentActive: boolean;
  seenElse: boolean;
}

type ExprTokenType = 'ident' | 'bool' | 'and' | 'or' | 'not' | 'lparen' | 'rparen' | 'eof';

interface ExprToken {
  type: ExprTokenType;
  value?: string;
}

export interface CSharpPreprocNormalizationDiagnostics {
  directivesSeen: number;
  inactiveLines: number;
  undefinedSymbols: string[];
  expressionErrors: number;
  unmatchedEndif: number;
  unterminatedIfBlocks: number;
}

export interface CSharpPreprocNormalizationResult {
  normalizedText: string;
  changed: boolean;
  diagnostics: CSharpPreprocNormalizationDiagnostics;
}

class ExprParser {
  private readonly tokens: ExprToken[];
  private index = 0;
  private readonly defines: Set<string>;
  private readonly undefinedSymbols: Set<string>;

  constructor(tokens: ExprToken[], defines: Set<string>, undefinedSymbols: Set<string>) {
    this.tokens = tokens;
    this.defines = defines;
    this.undefinedSymbols = undefinedSymbols;
  }

  parse(): boolean {
    const value = this.parseOr();
    this.expect('eof');
    return value;
  }

  private parseOr(): boolean {
    let value = this.parseAnd();
    while (this.match('or')) {
      const rhs = this.parseAnd();
      value = value || rhs;
    }
    return value;
  }

  private parseAnd(): boolean {
    let value = this.parseUnary();
    while (this.match('and')) {
      const rhs = this.parseUnary();
      value = value && rhs;
    }
    return value;
  }

  private parseUnary(): boolean {
    if (this.match('not')) {
      return !this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): boolean {
    if (this.match('lparen')) {
      const value = this.parseOr();
      this.expect('rparen');
      return value;
    }

    const token = this.current();
    if (token.type === 'bool') {
      this.index += 1;
      return token.value === 'true';
    }

    if (token.type === 'ident') {
      this.index += 1;
      const symbol = token.value || '';
      if (!this.defines.has(symbol)) this.undefinedSymbols.add(symbol);
      return this.defines.has(symbol);
    }

    throw new Error(`Unexpected token "${token.type}" in preprocessor expression`);
  }

  private current(): ExprToken {
    return this.tokens[this.index] || { type: 'eof' };
  }

  private match(type: ExprTokenType): boolean {
    if (this.current().type !== type) return false;
    this.index += 1;
    return true;
  }

  private expect(type: ExprTokenType): void {
    if (!this.match(type)) {
      throw new Error(`Expected token "${type}" in preprocessor expression`);
    }
  }
}

function tokenizeExpression(expression: string): ExprToken[] {
  const tokens: ExprToken[] = [];
  let i = 0;

  while (i < expression.length) {
    const ch = expression[i] || '';
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (expression.startsWith('&&', i)) {
      tokens.push({ type: 'and' });
      i += 2;
      continue;
    }

    if (expression.startsWith('||', i)) {
      tokens.push({ type: 'or' });
      i += 2;
      continue;
    }

    if (ch === '!') {
      tokens.push({ type: 'not' });
      i += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i += 1;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < expression.length && /[A-Za-z0-9_]/.test(expression[j] || '')) {
        j += 1;
      }
      const ident = expression.slice(i, j);
      if (ident === 'true' || ident === 'false') {
        tokens.push({ type: 'bool', value: ident });
      } else {
        tokens.push({ type: 'ident', value: ident });
      }
      i = j;
      continue;
    }

    throw new Error(`Unsupported token "${ch}" in preprocessor expression: ${expression}`);
  }

  tokens.push({ type: 'eof' });
  return tokens;
}

function evaluateExpression(
  expression: string,
  defines: Set<string>,
  undefinedSymbols: Set<string>,
): { value: boolean; ok: boolean } {
  if (!expression.trim()) return { value: false, ok: false };
  try {
    const parser = new ExprParser(tokenizeExpression(expression), defines, undefinedSymbols);
    return { value: parser.parse(), ok: true };
  } catch {
    return { value: false, ok: false };
  }
}

function deriveLineEnding(source: string): string {
  return source.includes('\r\n') ? '\r\n' : '\n';
}

function hasTrailingLineEnding(source: string): boolean {
  return /\r?\n$/.test(source);
}

export function normalizeCSharpPreprocessorBranches(
  source: string,
  defines: Set<string>,
): CSharpPreprocNormalizationResult {
  if (
    !source.includes('#if') &&
    !source.includes('#elif') &&
    !source.includes('#else') &&
    !source.includes('#endif')
  ) {
    return {
      normalizedText: source,
      changed: false,
      diagnostics: {
        directivesSeen: 0,
        inactiveLines: 0,
        undefinedSymbols: [],
        expressionErrors: 0,
        unmatchedEndif: 0,
        unterminatedIfBlocks: 0,
      },
    };
  }

  const lines = source.split(/(\r\n|\n|\r)/);
  const outputLines: string[] = [];
  const stack: ConditionalFrame[] = [];
  const undefinedSymbols = new Set<string>();

  let active = true;
  let changed = false;
  let directivesSeen = 0;
  let inactiveLines = 0;
  let expressionErrors = 0;
  let unmatchedEndif = 0;

  for (const line of lines) {
    if (/^[\r\n]+$/.test(line)) {
      outputLines.push(line);
      continue;
    }
    const directive = line.match(/^\s*#\s*(if|elif|else|endif)\b(.*)$/);
    if (directive) {
      directivesSeen += 1;
      changed = true;
      const keyword = directive[1] || '';
      const rawExpression = (directive[2] || '').trim();

      if (keyword === 'if') {
        const evalResult = evaluateExpression(rawExpression, defines, undefinedSymbols);
        if (!evalResult.ok) expressionErrors += 1;
        const branchActive = active && evalResult.value;
        stack.push({
          parentActive: active,
          branchTaken: branchActive,
          currentActive: branchActive,
          seenElse: false,
        });
        active = branchActive;
      } else if (keyword === 'elif') {
        const frame = stack[stack.length - 1];
        if (!frame) {
          unmatchedEndif += 1;
        } else if (frame.seenElse) {
          expressionErrors += 1;
          frame.currentActive = false;
          active = false;
        } else {
          const evalResult = evaluateExpression(rawExpression, defines, undefinedSymbols);
          if (!evalResult.ok) expressionErrors += 1;
          const branchActive = frame.parentActive && !frame.branchTaken && evalResult.value;
          frame.currentActive = branchActive;
          frame.branchTaken = frame.branchTaken || branchActive;
          active = frame.currentActive;
        }
      } else if (keyword === 'else') {
        const frame = stack[stack.length - 1];
        if (!frame) {
          unmatchedEndif += 1;
        } else {
          const branchActive = frame.parentActive && !frame.branchTaken;
          frame.currentActive = branchActive;
          frame.branchTaken = true;
          frame.seenElse = true;
          active = frame.currentActive;
        }
      } else if (keyword === 'endif') {
        if (stack.length === 0) {
          unmatchedEndif += 1;
        } else {
          stack.pop();
        }
        const top = stack[stack.length - 1];
        active = top ? top.currentActive : true;
      }

      outputLines.push(' '.repeat(line.length));
      continue;
    }

    if (active) {
      outputLines.push(line);
      continue;
    }

    if (line.length > 0) {
      changed = true;
      inactiveLines += 1;
    }
    outputLines.push(' '.repeat(line.length));
  }

  const normalizedText = outputLines.join('');

  return {
    normalizedText,
    changed,
    diagnostics: {
      directivesSeen,
      inactiveLines,
      undefinedSymbols: [...undefinedSymbols].sort(),
      expressionErrors,
      unmatchedEndif,
      unterminatedIfBlocks: stack.length,
    },
  };
}

// Each analyze run initializes its own main-thread and worker module state.
let configuredDefines: Set<string> | undefined;
let lastNormalization: CSharpPreprocNormalizationResult | undefined;
export function getLastCSharpNormalization(): CSharpPreprocNormalizationResult | undefined {
  return lastNormalization;
}
export function setCSharpDefineSymbols(symbols?: readonly string[]): void {
  configuredDefines = symbols === undefined ? undefined : new Set(symbols);
}
export function preprocessCSharpSource(source: string): string {
  lastNormalization =
    configuredDefines === undefined
      ? undefined
      : normalizeCSharpPreprocessorBranches(source, configuredDefines);
  return lastNormalization?.normalizedText ?? source;
}
