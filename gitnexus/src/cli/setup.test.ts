import { describe, it, expect } from 'vitest'

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..', '..');
const cliPath = path.join(packageRoot, 'dist', 'cli', 'index.js');

/** Accepts either bare 'gitnexus' or an absolute path to the binary. */
function expectGitnexusCommand(actual: string | undefined) {
  expect(actual).toMatch(/(^|\/)gitnexus$/);
}

/** Accepts either ['gitnexus', 'mcp'] or ['/path/to/gitnexus', 'mcp'] or npx fallback. */
function expectGitnexusArgs(actual: string[] | undefined) {
  expect(actual).toBeDefined();
  const args = actual!;
  expect(args).toContain('mcp');
  expect(args[0]).toMatch(/(^|\/)gitnexus$/);
}

async function runSetup(args: string[], env: NodeJS.ProcessEnv, cwd = packageRoot) {
  return execFileAsync(process.execPath, [cliPath, 'setup', ...args], { cwd, env });
}

it('setup without --agent uses legacy Cursor install path', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));

  try {
    await fs.mkdir(path.join(fakeHome, '.cursor'), { recursive: true });

    await runSetup([], {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
    });

    const cursorMcpPath = path.join(fakeHome, '.cursor', 'mcp.json');
    const cursorSkillPath = path.join(fakeHome, '.cursor', 'skills', 'gitnexus-cli', 'SKILL.md');
    const configPath = path.join(fakeHome, '.gitnexus', 'config.json');

    const cursorMcpRaw = await fs.readFile(cursorMcpPath, 'utf-8');
    const cursorMcp = JSON.parse(cursorMcpRaw) as {
      mcpServers?: Record<string, { command?: string; args?: string[] }>;
    };
    expectGitnexusCommand(cursorMcp.mcpServers?.gitnexus?.command);
    expect(cursorMcp.mcpServers?.gitnexus?.args).toEqual(['mcp']);
    await fs.access(cursorSkillPath);

    const configRaw = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configRaw) as { setupScope?: string };
    expect(config.setupScope).toBe('global');
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});

it('setup rejects invalid --agent', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));

  try {
    try {
      await runSetup(['--agent', 'cursor'], {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
      });
      throw new Error('expected setup with invalid --agent to fail');
    } catch (err: any) {
      expect(typeof err?.stdout).toBe('string');
      expect(err.stdout as string).toMatch(/Invalid --agent value/);
    }
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});

it('setup rejects using --cli-spec and --cli-version together', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));

  try {
    try {
      await runSetup(['--agent', 'opencode', '--cli-spec', '@veewo/gitnexus@1.4.7-rc', '--cli-version', '1.4.7-rc'], {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
      });
      throw new Error('expected setup with conflicting CLI options to fail');
    } catch (err: any) {
      expect(typeof err?.stdout).toBe('string');
      expect(err.stdout as string).toMatch(/Use either --cli-spec or --cli-version/);
    }
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});

it('setup installs global skills under ~/.agents/skills/gitnexus', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));

  try {
    await runSetup(['--agent', 'claude'], {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
    });

    const skillPath = path.join(
      fakeHome,
      '.agents',
      'skills',
      'gitnexus',
      'gitnexus-exploring',
      'SKILL.md',
    );
    const sharedRuntimeContractPath = path.join(
      fakeHome,
      '.agents',
      'skills',
      'gitnexus',
      '_shared',
      'unity-runtime-process-contract.md',
    );
    const configPath = path.join(fakeHome, '.gitnexus', 'config.json');

    await fs.access(skillPath);
    await fs.access(sharedRuntimeContractPath);
    const configRaw = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configRaw) as { setupScope?: string };
    expect(config.setupScope).toBe('global');
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});

it('setup configures Codex MCP when codex CLI is available', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));
  const fakeBin = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-bin-'));
  const codexShimPath = path.join(fakeBin, process.platform === 'win32' ? 'codex.cmd' : 'codex');

    // Ensure ~/.codex exists so setupCodex detects Codex as installed
    await fs.mkdir(path.join(fakeHome, ".codex"), { recursive: true });

  const shimLogic = `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === 'mcp' && args[1] === 'add' && args[2] === 'gitnexus') {
  const home = process.env.HOME || process.env.USERPROFILE;
  const outputPath = path.join(home, '.codex', 'gitnexus-mcp-add.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ args }, null, 2));
  process.exit(0);
}
if (args[0] === '--version') {
  process.stdout.write('codex-shim 0.0.0\\n');
  process.exit(0);
}
process.exit(0);
`;

  try {
    if (process.platform === 'win32') {
      const runnerPath = path.join(fakeBin, 'codex-shim.cjs');
      await fs.writeFile(runnerPath, shimLogic, 'utf-8');
      await fs.writeFile(codexShimPath, `@echo off\r\nnode "${runnerPath}" %*\r\n`, 'utf-8');
    } else {
      await fs.writeFile(codexShimPath, `#!/usr/bin/env node\n${shimLogic}`, { mode: 0o755 });
    }

    await runSetup(['--agent', 'codex'], {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
    });

    const outputPath = path.join(fakeHome, '.codex', 'gitnexus-mcp-add.json');
    const raw = await fs.readFile(outputPath, 'utf-8');
    const parsed = JSON.parse(raw) as { args: string[] };

    expect(parsed.args.slice(0, 4)).toEqual(['mcp', 'add', 'gitnexus', '--']);
    expect(parsed.args.includes('gitnexus')).toBeTruthy();
    expect(parsed.args.includes('mcp')).toBeTruthy();
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
    await fs.rm(fakeBin, { recursive: true, force: true });
  }
});

it('setup configures OpenCode MCP in ~/.config/opencode/opencode.json', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));

  try {
    const opencodeDir = path.join(fakeHome, '.config', 'opencode');
    await fs.mkdir(opencodeDir, { recursive: true });

    await runSetup(['--agent', 'opencode'], {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
    });

    const opencodeConfigPath = path.join(opencodeDir, 'opencode.json');
    const opencodeRaw = await fs.readFile(opencodeConfigPath, 'utf-8');
    const opencodeConfig = JSON.parse(opencodeRaw) as {
      mcp?: Record<string, { type?: string; command?: string[] }>;
    };

    expect(opencodeConfig.mcp?.gitnexus?.type).toBe('local');
    expectGitnexusArgs(opencodeConfig.mcp?.gitnexus?.command);
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});

it('setup --cli-version pins MCP package spec and persists it in config', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));

  try {
    const opencodeDir = path.join(fakeHome, '.config', 'opencode');
    await fs.mkdir(opencodeDir, { recursive: true });

    await runSetup(['--agent', 'opencode', '--cli-version', '1.4.7-rc'], {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
    });

    const opencodeConfigPath = path.join(opencodeDir, 'opencode.json');
    const opencodeRaw = await fs.readFile(opencodeConfigPath, 'utf-8');
    const opencodeConfig = JSON.parse(opencodeRaw) as {
      mcp?: Record<string, { type?: string; command?: string[] }>;
    };

    const configPath = path.join(fakeHome, '.gitnexus', 'config.json');
    const savedConfigRaw = await fs.readFile(configPath, 'utf-8');
    const savedConfig = JSON.parse(savedConfigRaw) as {
      cliPackageSpec?: string;
      cliVersion?: string;
    };

    expectGitnexusArgs(opencodeConfig.mcp?.gitnexus?.command);
    // Version is persisted to config, not MCP entry:
    // The package spec may use the resolved package name from the monorepo root
    // or the published npm package name depending on the runtime environment.
    const spec = savedConfig.cliPackageSpec || '';
    expect(spec).toMatch(/@1\.4\.7-rc$/);
    expect(savedConfig.cliVersion).toBe('1.4.7-rc');
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});

it('setup keeps using legacy ~/.config/opencode/config.json when it already exists', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));

  try {
    const opencodeDir = path.join(fakeHome, '.config', 'opencode');
    const legacyConfigPath = path.join(opencodeDir, 'config.json');
    const preferredConfigPath = path.join(opencodeDir, 'opencode.json');
    await fs.mkdir(opencodeDir, { recursive: true });
    await fs.writeFile(legacyConfigPath, JSON.stringify({ existing: true }, null, 2), 'utf-8');

    await runSetup(['--agent', 'opencode'], {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
    });

    const legacyRaw = await fs.readFile(legacyConfigPath, 'utf-8');
    const legacyConfig = JSON.parse(legacyRaw) as {
      existing?: boolean;
      mcp?: Record<string, { type?: string; command?: string[] }>;
    };

    expect(legacyConfig.existing).toBe(true);
    expect(legacyConfig.mcp?.gitnexus?.type).toBe('local');
    expectGitnexusArgs(legacyConfig.mcp?.gitnexus?.command);
    await expect(fs.access(preferredConfigPath)).rejects.toThrow();
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});

it('setup --agent opencode does not install Claude hooks', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));

  try {
    const opencodeDir = path.join(fakeHome, '.config', 'opencode');
    const claudeDir = path.join(fakeHome, '.claude');
    const claudeSettingsPath = path.join(claudeDir, 'settings.json');
    const claudeHookPath = path.join(claudeDir, 'hooks', 'gitnexus', 'gitnexus-hook.cjs');
    await fs.mkdir(opencodeDir, { recursive: true });
    await fs.mkdir(claudeDir, { recursive: true });

    await runSetup(['--agent', 'opencode'], {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
    });

    await expect(fs.access(claudeSettingsPath)).rejects.toThrow();
    await expect(fs.access(claudeHookPath)).rejects.toThrow();
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});

it('setup --scope project --agent claude writes only .mcp.json', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));
  const fakeRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-repo-'));

  try {
    await execFileAsync('git', ['init'], { cwd: fakeRepo });

    await runSetup(['--scope', 'project', '--agent', 'claude'], {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
    }, fakeRepo);

    const projectMcpPath = path.join(fakeRepo, '.mcp.json');
    const codexConfigPath = path.join(fakeRepo, '.codex', 'config.toml');
    const opencodeConfigPath = path.join(fakeRepo, 'opencode.json');

    const projectMcpRaw = await fs.readFile(projectMcpPath, 'utf-8');
    const projectMcp = JSON.parse(projectMcpRaw) as { mcpServers?: Record<string, { command?: string; args?: string[] }> };

    expectGitnexusCommand(projectMcp.mcpServers?.gitnexus?.command);
    expect(projectMcp.mcpServers?.gitnexus?.args).toEqual(['mcp']);
    await expect(fs.access(codexConfigPath)).rejects.toThrow();
    await expect(fs.access(opencodeConfigPath)).rejects.toThrow();
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
    await fs.rm(fakeRepo, { recursive: true, force: true });
  }
});

it('setup --scope project --agent codex writes only .codex/config.toml', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));
  const fakeRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-repo-'));

  try {
    await execFileAsync('git', ['init'], { cwd: fakeRepo });

    await runSetup(['--scope', 'project', '--agent', 'codex'], {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
    }, fakeRepo);

    const projectMcpPath = path.join(fakeRepo, '.mcp.json');
    const codexConfigPath = path.join(fakeRepo, '.codex', 'config.toml');
    const opencodeConfigPath = path.join(fakeRepo, 'opencode.json');

    const codexConfigRaw = await fs.readFile(codexConfigPath, 'utf-8');

    expect(codexConfigRaw).toMatch(/\[mcp_servers\.gitnexus\]/);
    expect(codexConfigRaw).toMatch(/command = ".*gitnexus"/);
    expect(codexConfigRaw).toMatch(/args = \["mcp"\]/);
    await expect(fs.access(projectMcpPath)).rejects.toThrow();
    await expect(fs.access(opencodeConfigPath)).rejects.toThrow();
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
    await fs.rm(fakeRepo, { recursive: true, force: true });
  }
});

it('setup --scope project --agent codex replaces existing gitnexus table without duplicate keys', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));
  const fakeRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-repo-'));

  try {
    await execFileAsync('git', ['init'], { cwd: fakeRepo });

    const codexConfigPath = path.join(fakeRepo, '.codex', 'config.toml');
    await fs.mkdir(path.dirname(codexConfigPath), { recursive: true });
    await fs.writeFile(
      codexConfigPath,
      [
        '[mcp_servers.gitnexus]',
        'command = "npx"',
        'args = ["-y", "oldpkg@latest", "mcp"]',
        '',
        '[profiles.default]',
        'model = "gpt-5"',
        '',
      ].join('\n'),
      'utf-8',
    );

    await runSetup(['--scope', 'project', '--agent', 'codex'], {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
    }, fakeRepo);

    const codexConfigRaw = await fs.readFile(codexConfigPath, 'utf-8');
    const tableMatches = codexConfigRaw.match(/^\[mcp_servers\.gitnexus\]$/gm) || [];
    expect(tableMatches.length).toBe(1);

    const gitnexusTableMatch = codexConfigRaw.match(
      /^\[mcp_servers\.gitnexus\][\s\S]*?(?=^\[[^\]]+\]|(?![\s\S]))/m,
    );
    expect(gitnexusTableMatch).toBeTruthy();
    const gitnexusTable = gitnexusTableMatch[0];

    expect((gitnexusTable.match(/^command\s*=/gm) || []).length).toBe(1);
    expect((gitnexusTable.match(/^args\s*=/gm) || []).length).toBe(1);
    expect(gitnexusTable).toMatch(/command = ".*gitnexus"/);
    expect(gitnexusTable).not.toMatch(/oldpkg@latest/);
    expect(codexConfigRaw).toMatch(/^\[profiles\.default\]$/m);
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
    await fs.rm(fakeRepo, { recursive: true, force: true });
  }
});

it('setup --scope project --agent codex is idempotent across repeated runs', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));
  const fakeRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-repo-'));

  try {
    await execFileAsync('git', ['init'], { cwd: fakeRepo });

    const env = {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
    };

    await runSetup(['--scope', 'project', '--agent', 'codex'], env, fakeRepo);
    await runSetup(['--scope', 'project', '--agent', 'codex'], env, fakeRepo);

    const codexConfigPath = path.join(fakeRepo, '.codex', 'config.toml');
    const codexConfigRaw = await fs.readFile(codexConfigPath, 'utf-8');
    const tableMatches = codexConfigRaw.match(/^\[mcp_servers\.gitnexus\]$/gm) || [];
    expect(tableMatches.length).toBe(1);

    const gitnexusTableMatch = codexConfigRaw.match(
      /^\[mcp_servers\.gitnexus\][\s\S]*?(?=^\[[^\]]+\]|(?![\s\S]))/m,
    );
    expect(gitnexusTableMatch).toBeTruthy();
    const gitnexusTable = gitnexusTableMatch[0];

    expect((gitnexusTable.match(/^command\s*=/gm) || []).length).toBe(1);
    expect((gitnexusTable.match(/^args\s*=/gm) || []).length).toBe(1);
    expect(gitnexusTable).toMatch(/command = ".*gitnexus"/);
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
    await fs.rm(fakeRepo, { recursive: true, force: true });
  }
});

it('setup --scope project --agent opencode writes only opencode.json', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));
  const fakeRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-repo-'));

  try {
    await execFileAsync('git', ['init'], { cwd: fakeRepo });

    await runSetup(['--scope', 'project', '--agent', 'opencode'], {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
    }, fakeRepo);

    const projectMcpPath = path.join(fakeRepo, '.mcp.json');
    const codexConfigPath = path.join(fakeRepo, '.codex', 'config.toml');
    const opencodeConfigPath = path.join(fakeRepo, 'opencode.json');
    const localSkillPath = path.join(
      fakeRepo,
      '.agents',
      'skills',
      'gitnexus',
      'gitnexus-exploring',
      'SKILL.md',
    );
    const globalSkillPath = path.join(
      fakeHome,
      '.agents',
      'skills',
      'gitnexus',
      'gitnexus-exploring',
      'SKILL.md',
    );
    const configPath = path.join(fakeHome, '.gitnexus', 'config.json');

    const opencodeRaw = await fs.readFile(opencodeConfigPath, 'utf-8');
    const opencodeConfig = JSON.parse(opencodeRaw) as {
      mcp?: Record<string, { type?: string; command?: string[] }>;
    };
    const configRaw = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configRaw) as { setupScope?: string };

    expect(opencodeConfig.mcp?.gitnexus?.type).toBe('local');
    expectGitnexusArgs(opencodeConfig.mcp?.gitnexus?.command);
    await expect(fs.access(projectMcpPath)).rejects.toThrow();
    await expect(fs.access(codexConfigPath)).rejects.toThrow();
    await fs.access(localSkillPath);
    await expect(fs.access(globalSkillPath)).rejects.toThrow();
    expect(config.setupScope).toBe('project');
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
    await fs.rm(fakeRepo, { recursive: true, force: true });
  }
});
