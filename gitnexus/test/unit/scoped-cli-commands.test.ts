import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..', '..');

async function read(relPath: string): Promise<string> {
  return fs.readFile(path.join(packageRoot, relPath), 'utf-8');
}

test('core generated guidance uses npx-based instructions (no hardcoded version in npx -y)', async () => {
  const aiContext = await read('src/cli/ai-context.ts');
  const resources = await read('src/mcp/resources.ts');

  // Both files reference the index/analyze instruction via npx (not npx -y)
  expect(aiContext).toContain('npx gitnexus analyze');
  expect(resources).toContain('npx gitnexus analyze');
  expect(aiContext).not.toContain('npx -y gitnexus analyze');
  expect(resources).not.toContain('npx -y gitnexus analyze');
});

test('MCP JSON manifests use local gitnexus binary (no hardcoded npx package)', async () => {
  const roots = [
    '../.mcp.json',
    '../gitnexus-claude-plugin/.mcp.json',
    '../gitnexus-claude-plugin/skills/gitnexus-cli/mcp.json',
    '../gitnexus-claude-plugin/skills/gitnexus-debugging/mcp.json',
    '../gitnexus-claude-plugin/skills/gitnexus-exploring/mcp.json',
    '../gitnexus-claude-plugin/skills/gitnexus-guide/mcp.json',
    '../gitnexus-claude-plugin/skills/gitnexus-impact-analysis/mcp.json',
    '../gitnexus-claude-plugin/skills/gitnexus-refactoring/mcp.json',
  ];

  for (const relPath of roots) {
    const raw = await fs.readFile(path.resolve(packageRoot, relPath), 'utf-8');
    expect(raw).toContain('"command": "gitnexus"');
    expect(raw).toContain('"args": ["mcp"]');
    expect(raw).not.toContain('@veewo/gitnexus@latest');
  }
});
