import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { STANDARD_SKILL_CATALOG } from '../../src/cli/standard-skills.js';

const root = path.resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('fork standard skill distribution and CLI steering', () => {
  it('ships all seven standard skills identically at their declared locations', () => {
    expect(STANDARD_SKILL_CATALOG).toHaveLength(7);
    for (const skill of STANDARD_SKILL_CATALOG) {
      const source = read(`gitnexus/skills/${skill.name}.md`);
      expect(source).toContain(`name: ${skill.name}`);
      const targets = [`.agents/skills/gitnexus/${skill.name}/SKILL.md`];
      if (skill.distributions.claudePlugin)
        targets.push(`gitnexus-claude-plugin/skills/${skill.name}/SKILL.md`);
      if (skill.distributions.cursor)
        targets.push(`gitnexus-cursor-integration/skills/${skill.name}/SKILL.md`);
      for (const target of targets) expect(read(target), target).toBe(source);
    }
  });

  it('uses a local CLI or configured package pin for every CLI operation', () => {
    const cli = read('gitnexus/skills/gitnexus-cli.md');
    for (const command of ['analyze', 'status', 'clean', 'wiki', 'list']) {
      expect(cli).toContain(`$GN ${command}`);
    }
    expect(cli).toContain('cliPackageSpec');
    expect(cli).toContain('cliVersion');
    expect(cli.indexOf('cliPackageSpec')).toBeLessThan(cli.indexOf('cliVersion'));
    expect(cli).toContain('Missing GitNexus CLI package spec');
    expect(cli).not.toMatch(/npx\s+(?:-y\s+)?(?:@veewo\/)?gitnexus@latest/);
  });

  it('retains Unity narrowing and parity guidance in the shared contracts', () => {
    const exploring = read('gitnexus/skills/gitnexus-exploring.md');
    expect(exploring).toContain('recommended_follow_up');
    expect(exploring).toContain('missing_proof_targets');
    expect(read('gitnexus/skills/_shared/unity-runtime-process-contract.md')).toContain('parity');
  });
});
