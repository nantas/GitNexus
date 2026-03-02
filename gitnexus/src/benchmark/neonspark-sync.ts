import fs from 'node:fs/promises';
import path from 'node:path';

export function parseManifest(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
}

function wildcardPrefix(rule: string): string {
  return rule.endsWith('*') ? rule.slice(0, -1) : rule;
}

export function shouldIncludeRelativePath(relPath: string, roots: string[]): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  if (!normalized.endsWith('.cs')) return false;

  return roots.some((rule) => {
    const normalizedRule = rule.replace(/\\/g, '/');
    const prefix = wildcardPrefix(normalizedRule);
    if (normalizedRule.endsWith('*')) {
      return normalized.startsWith(prefix);
    }
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
}

async function walk(dir: string, base: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['.git', 'Library', 'Logs', 'Temp', 'Obj', 'UserSettings'].includes(e.name)) continue;
      await walk(full, base, out);
      continue;
    }
    const rel = path.relative(base, full).replace(/\\/g, '/');
    out.push(rel);
  }
}

export async function syncFixture(sourceRoot: string, fixtureRoot: string, manifestPath: string): Promise<number> {
  const manifest = await fs.readFile(manifestPath, 'utf-8');
  const roots = parseManifest(manifest);

  const allFiles: string[] = [];
  await walk(sourceRoot, sourceRoot, allFiles);

  const selected = allFiles.filter((rel) => shouldIncludeRelativePath(rel, roots));

  await fs.rm(fixtureRoot, { recursive: true, force: true });
  for (const rel of selected) {
    const src = path.join(sourceRoot, rel);
    const dst = path.join(fixtureRoot, rel);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst);
  }

  return selected.length;
}
