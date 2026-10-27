/** Content receipt for Unity analysis, independent of graph File nodes.
 * Candidate inputs need not materialize in the graph. Never use this inventory
 * as a row-deletion list. Failure to enumerate/read an input aborts validation.
 */
import { createHash } from 'node:crypto';
import { createReadStream, readdir } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { glob, type GlobOptionsWithFileTypesFalse } from 'glob';
import { getLanguageFromFilename, SupportedLanguages } from 'gitnexus-shared';
import { createIgnoreFilter, shouldIgnorePath } from '../../config/ignore-service.js';
import { getCoreExcludesFilePath, getGitInfoExcludePath } from '../../storage/git.js';
import { pathMatchesScopeRules } from '../ingestion/scope-filter.js';
import { getMaxFileSizeBytes } from '../ingestion/utils/max-file-size.js';

export interface AnalysisInputReceipt {
  version: 1;
  digest: string;
  fileCount: number;
}
export interface UnityInputSnapshot {
  receipt: AnalysisInputReceipt;
  hashes: Map<string, string>;
  reusable: boolean;
  elapsedMs: number;
}
interface Selection {
  scopeRules?: string[];
  includeExtensions?: string[];
  csharpDefineCsproj?: string;
}

// glob/path-scurry intentionally swallow traversal errors. Capture those errors
// at the filesystem boundary; an unreadable subtree is not an empty subtree.
async function strictGlob(
  repo: string,
  pattern: string | string[],
  options: GlobOptionsWithFileTypesFalse = {},
): Promise<string[]> {
  const failures: string[] = [];
  const files = await glob(pattern, {
    ...options,
    cwd: repo,
    nodir: true,
    fs: {
      readdir(dir, opts, cb) {
        readdir(dir, opts, (error, entries) => {
          if (error) failures.push(`${dir}: ${error.code}`);
          cb(error, entries);
        });
      },
      promises: {
        async readdir(dir, opts) {
          try {
            return await fs.readdir(dir, opts);
          } catch (error) {
            failures.push(`${dir}: ${(error as NodeJS.ErrnoException).code}`);
            throw error;
          }
        },
      },
    },
  });
  if (failures.length)
    throw new Error(`Unity input-failure: enumeration failed (${failures.slice(0, 3).join('; ')})`);
  return files.map((file) => file.replace(/\\/g, '/')).sort();
}

async function optionalFile(file: string): Promise<boolean> {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error(`Unity input-failure: expected regular file: ${file}`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Bounded streaming reads; errors remain errors, never missing map entries. */
export async function hashInputFiles(
  repo: string,
  files: readonly string[],
): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  for (let start = 0; start < files.length; start += 16) {
    // Settle the entire batch before propagating a failure (no orphan I/O).
    const results = await Promise.allSettled(
      files.slice(start, start + 16).map(async (file) => {
        const absolute = path.resolve(repo, file);
        const before = await fs.stat(absolute);
        if (!before.isFile()) throw new Error(`not a regular file: ${file}`);
        const hash = createHash('sha256');
        for await (const bytes of createReadStream(absolute)) hash.update(bytes);
        const after = await fs.stat(absolute);
        if (
          before.size !== after.size ||
          before.mtimeMs !== after.mtimeMs ||
          before.ctimeMs !== after.ctimeMs ||
          before.ino !== after.ino
        ) {
          throw new Error(`input changed while hashing: ${file}`);
        }
        return [file, hash.digest('hex')] as const;
      }),
    );
    for (const result of results) {
      if (result.status === 'rejected')
        throw new Error(`Unity input-failure: ${String(result.reason)}`);
      hashes.set(...result.value);
    }
  }
  return hashes;
}

/** A conservative superset of actual readers, with the same source/resource
 * scope rules. The namespace reader deliberately reads C# outside source scope
 * and gitignore; those bytes are semantic inputs too.
 */
export async function captureUnityInputSnapshot(
  repo: string,
  selection: Selection,
  previouslyEnabled = false,
): Promise<UnityInputSnapshot | undefined> {
  const started = performance.now();
  const candidates = await strictGlob(
    repo,
    ['**/*.prefab', '**/*.unity', '**/*.asset', '**/*.cs'],
    { dot: false },
  );
  const resources = candidates.filter((file) => /\.(prefab|unity|asset)$/.test(file));
  const selectedResources = resources.filter(
    (file) => !shouldIgnorePath(file) && pathMatchesScopeRules(file, selection.scopeRules ?? []),
  );
  const assetScripts = candidates.filter(
    (file) => file.startsWith('Assets/') && file.endsWith('.cs'),
  );
  if (!previouslyEnabled && !resources.length && !assetScripts.length) return undefined;

  const ignore = await createIgnoreFilter(repo, { strictRepoControlFiles: true });
  const sourceCandidates = await strictGlob(repo, '**/*', { dot: false, ignore });
  const extensions = new Set(
    (selection.includeExtensions ?? []).map((ext) =>
      (ext.startsWith('.') ? ext : `.${ext}`).toLowerCase(),
    ),
  );
  const sources = sourceCandidates.filter(
    (file) =>
      pathMatchesScopeRules(file, selection.scopeRules ?? []) &&
      (!extensions.size || extensions.has(path.extname(file).toLowerCase())),
  );
  const inputs = new Set(sources);
  for (const file of sourceCandidates.filter((file) => file.endsWith('.cshtml'))) inputs.add(file);
  // Empty scopedPaths currently makes the resource processor fall back to its
  // repository-wide glob. Match that reader, including its ignored resources.
  for (const resource of selectedResources.length ? selectedResources : resources) {
    inputs.add(resource);
    if (await optionalFile(path.join(repo, `${resource}.meta`))) inputs.add(`${resource}.meta`);
  }
  // Project configuration discovery remains repository-wide; namespace evidence
  // now comes from the indexed parse results, not out-of-scope source reads.
  const projectInputs = await strictGlob(repo, '**/*.csproj', {
    dot: true,
    ignore: ['**/node_modules/**', '**/.git/**', '**/bin/**', '**/obj/**'],
  });
  for (const file of projectInputs) inputs.add(file);
  for (const file of [...sources, ...assetScripts].filter((file) => file.endsWith('.cs'))) {
    if (await optionalFile(path.join(repo, `${file}.meta`))) inputs.add(`${file}.meta`);
  }
  if (!selectedResources.length) {
    for (const file of await strictGlob(repo, ['**/*.cs', '**/*.cs.meta', '**/*.meta'], {
      dot: false,
    }))
      inputs.add(file);
  }
  const controls = [
    '.gitnexusrc',
    '.gitignore',
    '.gitnexusignore',
    '.gitnexus/config.json',
    // Payload selection currently reads invocation cwd; lifecycle reads repo.
    path.join(process.cwd(), '.gitnexus/config.json'),
  ];
  if (selection.csharpDefineCsproj) controls.push(path.resolve(repo, selection.csharpDefineCsproj));
  for (const control of [getCoreExcludesFilePath(repo), getGitInfoExcludePath(repo)])
    if (control) controls.push(control);
  for (const file of controls) {
    const absolute = path.resolve(repo, file);
    const relative = path.relative(repo, absolute).replace(/\\/g, '/');
    const key = relative.startsWith('../') || path.isAbsolute(relative) ? absolute : relative;
    if (await optionalFile(absolute)) inputs.add(key);
  }

  const hashes = await hashInputFiles(repo, [...inputs].sort());
  const digest = createHash('sha256');
  digest.update(
    JSON.stringify({
      version: 1,
      selection,
      maxFileSizeBytes: getMaxFileSizeBytes(),
      prefabSourcePassDisabled: ['1', 'true', 'yes', 'on'].includes(
        (process.env.GITNEXUS_DISABLE_PREFAB_SOURCE_PASS ?? '').trim().toLowerCase(),
      ),
      noGitignore: !!process.env.GITNEXUS_NO_GITIGNORE,
      noGlobalIgnore: !!process.env.GITNEXUS_NO_GLOBAL_IGNORE,
    }),
  );
  for (const [file, hash] of hashes) digest.update(JSON.stringify([file, hash]));
  // Other languages may consume external project configuration not audited by
  // this receipt. They remain safe full builds until that closure is covered.
  const reusable = sources.every((file) => {
    const language = getLanguageFromFilename(file);
    return language === null || language === undefined || language === SupportedLanguages.CSharp;
  });
  return {
    receipt: { version: 1, digest: digest.digest('hex'), fileCount: hashes.size },
    hashes,
    reusable,
    elapsedMs: performance.now() - started,
  };
}
