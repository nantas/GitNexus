import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');

const FORBIDDEN_ABSOLUTE_PATTERNS = [
  /\/Volumes\/[^"'`\s]*unity-projects\/neonspark/g,
  /\/Users\/[^"'`\s]*unity-projects\/neonspark/g,
];

const RELEASE_FILES = [
  'gitnexus/package.json',
  'benchmarks/u2-e2e/neonspark-full-u2-e2e.config.json',
];

const RELEASE_DIR_RULES = [
  { root: '.github/workflows', exts: new Set(['.yml', '.yaml']) },
  { root: 'gitnexus/src', exts: new Set(['.ts']) },
];

function shouldScan(relPath) {
  if (RELEASE_FILES.includes(relPath)) {
    return true;
  }

  for (const rule of RELEASE_DIR_RULES) {
    if (!relPath.startsWith(`${rule.root}/`)) continue;
    if (relPath.endsWith('.test.ts')) return false;
    if (rule.exts.has(path.extname(relPath))) return true;
  }

  return false;
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(fullPath)));
    } else if (entry.isFile()) {
      out.push(fullPath);
    }
  }
  return out;
}

async function collectReleaseFiles() {
  const roots = ['.github/workflows', 'gitnexus/src'];
  const fullPaths = [];
  for (const root of roots) {
    const abs = path.join(repoRoot, root);
    try {
      fullPaths.push(...(await walk(abs)));
    } catch (error) {
      const code = error && typeof error === 'object' ? error.code : undefined;
      if (code !== 'ENOENT') throw error;
    }
  }

  for (const rel of RELEASE_FILES) {
    fullPaths.push(path.join(repoRoot, rel));
  }

  const dedup = new Map();
  for (const full of fullPaths) {
    const rel = path.relative(repoRoot, full).split(path.sep).join('/');
    if (!shouldScan(rel)) continue;
    dedup.set(rel, full);
  }
  return [...dedup.entries()];
}

async function main() {
  const files = await collectReleaseFiles();
  const hits = [];

  for (const [relPath, absPath] of files) {
    const content = await fs.readFile(absPath, 'utf-8');
    for (const pattern of FORBIDDEN_ABSOLUTE_PATTERNS) {
      const matched = content.match(pattern);
      if (matched && matched.length > 0) {
        hits.push({ relPath, matched: matched[0], pattern: String(pattern) });
      }
    }
  }

  if (hits.length > 0) {
    process.stderr.write('Release path hygiene check failed.\n');
    for (const hit of hits) {
      process.stderr.write(
        `- ${hit.relPath}: contains "${hit.matched}" (pattern: ${hit.pattern})\n`,
      );
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write('Release path hygiene check passed.\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
