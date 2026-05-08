import Parser from 'tree-sitter';
import { createRequire } from 'node:module';
import { SupportedLanguages } from '../../config/supported-languages.js';
import { getTreeSitterBufferSize } from '../ingestion/constants.js';

const _require = createRequire(import.meta.url);

const ISSUES_URL = 'https://github.com/abhigyanpatwari/GitNexus/issues';

const requiredLanguageMap: Record<string, any> = {
  [SupportedLanguages.JavaScript]: JavaScript,
  [SupportedLanguages.TypeScript]: TypeScript.typescript,
  [`${SupportedLanguages.TypeScript}:tsx`]: TypeScript.tsx,
  [SupportedLanguages.Python]: Python,
  [SupportedLanguages.Java]: Java,
  [SupportedLanguages.C]: C,
  [SupportedLanguages.CPlusPlus]: CPP,
  [SupportedLanguages.CSharp]: CSharp,
  [SupportedLanguages.Go]: Go,
  [SupportedLanguages.Rust]: Rust,
  [SupportedLanguages.PHP]: PHP.php_only,
  [SupportedLanguages.Ruby]: Ruby,
};

const optionalLanguagePackages: Partial<Record<SupportedLanguages, string>> = {
  [SupportedLanguages.GDScript]: 'tree-sitter-gdscript',
  [SupportedLanguages.Swift]: 'tree-sitter-swift',
  [SupportedLanguages.Kotlin]: 'tree-sitter-kotlin',
};

const optionalLanguageCache = new Map<SupportedLanguages, any | null>();
const optionalAvailabilityCache = new Map<SupportedLanguages, boolean>();

const isOptionalLanguageInstalled = (language: SupportedLanguages): boolean => {
  if (optionalAvailabilityCache.has(language)) {
    return optionalAvailabilityCache.get(language)!;
  }
  const packageName = optionalLanguagePackages[language];
  if (!packageName) {
    optionalAvailabilityCache.set(language, false);
    return false;
  }
  try {
    _require.resolve(packageName);
    optionalAvailabilityCache.set(language, true);
    return true;
  } catch {
    optionalAvailabilityCache.set(language, false);
    return false;
  }
};

const loadOptionalLanguage = (language: SupportedLanguages): any | null => {
  if (optionalLanguageCache.has(language)) {
    return optionalLanguageCache.get(language);
  }
  const packageName = optionalLanguagePackages[language];
  if (!packageName) {
    optionalLanguageCache.set(language, null);
    return null;
  }
  try {
    const grammar = _require(packageName);
    optionalLanguageCache.set(language, grammar);
    return grammar;
  } catch {
    optionalLanguageCache.set(language, null);
    optionalAvailabilityCache.set(language, false);
    return null;
  }
};

const resolveLanguage = (key: string, language: SupportedLanguages): any | null => {
  if (key in requiredLanguageMap) {
    return requiredLanguageMap[key];
  }
  return loadOptionalLanguage(language);
};

export const isLanguageAvailable = (language: SupportedLanguages): boolean =>
  language in requiredLanguageMap || isOptionalLanguageInstalled(language);

const loadCache = new Map<string, LoadResult>();
const logged = new Set<string>();

const logFailure = (key: string, result: LoadResult): void => {
  if (result.ok === true) return;
  if (logged.has(key)) return;
  logged.add(key);
  const message = `[gitnexus] ${result.note} (${result.error.message})`;

  // Severity routes to the correct pino level. Both go to stderr (pino's
  // default destination), so MCP stdio framing is preserved either way —
  // the level tag drives log filtering, not channel selection.
  if (result.severity === 'error') {
    logger.error(message);
  } else {
    logger.warn(message);
  }
};

export const resolveLanguageKey = (language: SupportedLanguages, filePath?: string): string =>
  language === SupportedLanguages.TypeScript && filePath?.endsWith('.tsx')
    ? `${language}:tsx`
    : language;

  const lang = resolveLanguage(key, language);
  if (!lang) {
    throw new Error(`Unsupported language: ${language}`);
  }

  let result: LoadResult;
  try {
    result = { ok: true, grammar: source.load() };
  } catch (err) {
    const fatal = !source.optional;
    result = {
      ok: false,
      error: err as Error,
      note: source.unavailableNote,
      fatal,
      severity: source.severity ?? (fatal ? 'error' : 'warn'),
    };
  }
  loadCache.set(key, result);
  if (result.ok === false) logFailure(key, result);
  return result;
};

export const isLanguageAvailable = (language: SupportedLanguages, filePath?: string): boolean =>
  loadGrammar(resolveLanguageKey(language, filePath)).ok;

export const getLanguageGrammar = (language: SupportedLanguages, filePath?: string): unknown => {
  const key = resolveLanguageKey(language, filePath);
  const result = loadGrammar(key);
  if (result.ok === true) return result.grammar;
  // Fatal failures throw the original underlying error (preserving stack)
  // after the note has been logged. Optional failures fall through to the
  // standard "Unsupported language" message that callers already handle.
  if (result.fatal) throw result.error;
  throw new Error(`Unsupported language: ${language}`);
};

let sharedParser: Parser | null = null;

export const loadParser = async (): Promise<Parser> => (sharedParser ??= new Parser());

export const loadLanguage = async (
  language: SupportedLanguages,
  filePath?: string,
): Promise<void> => {
  const parser = await loadParser();
  parser.setLanguage(getLanguageGrammar(language, filePath));
};

export const createParserForLanguage = async (
  language: SupportedLanguages,
  filePath?: string,
): Promise<Parser> => {
  const parser = new Parser();
  parser.setLanguage(getLanguageGrammar(language, filePath));
  return parser;
};

/**
 * Parse source code using tree-sitter's string input path with an adaptive
 * native buffer size.
 *
 * The callback input API receives byte offsets. Returning JavaScript string
 * slices from those byte offsets is unsafe for UTF-8/multi-byte content and has
 * caused native tree-sitter crashes in large repositories. Use the stable string
 * input path instead and raise tree-sitter's internal buffer for large files.
 *
 * @param content - Full source file content as UTF-8 string
 * @param oldTree - Optional previous tree for incremental parsing (must call tree.edit() first)
 * @returns Parsed syntax tree
 */
export const parseContent = (content: string, oldTree?: any): any => {
  if (!parser) throw new Error('Parser not initialized — call loadParser() first');
  const bufferSize = getTreeSitterBufferSize(Buffer.byteLength(content, 'utf8'));
  return parser.parse(content, oldTree ?? null, { bufferSize });
};
