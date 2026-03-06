import test from 'node:test';
import assert from 'node:assert/strict';
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
const packageName = JSON.parse(
  await fs.readFile(path.join(packageRoot, 'package.json'), 'utf-8'),
) as { name?: string };
const expectedMcpPackage = `${packageName.name || 'gitnexus'}@latest`;

async function runSetup(args: string[], env: NodeJS.ProcessEnv, cwd = packageRoot) {
  return execFileAsync(process.execPath, [cliPath, 'setup', ...args], { cwd, env });
}

test('setup requires --agent', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));

  try {
    try {
      await runSetup([], {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
      });
      assert.fail('expected setup without --agent to fail');
    } catch (err: any) {
      assert.equal(typeof err?.stdout, 'string');
      assert.match(err.stdout as string, /Missing --agent/);
    }
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});

test('setup rejects invalid --agent', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));

  try {
    try {
      await runSetup(['--agent', 'cursor'], {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
      });
      assert.fail('expected setup with invalid --agent to fail');
    } catch (err: any) {
      assert.equal(typeof err?.stdout, 'string');
      assert.match(err.stdout as string, /Invalid --agent value/);
    }
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});

test('setup installs global skills under ~/.agents/skills/gitnexus', async () => {
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
    const configPath = path.join(fakeHome, '.gitnexus', 'config.json');

    await fs.access(skillPath);
    const configRaw = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configRaw) as { setupScope?: string };
    assert.equal(config.setupScope, 'global');
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});

test('setup configures Codex MCP when codex CLI is available', async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-home-'));
  const fakeBin = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-setup-bin-'));
  const codexShimPath = path.join(fakeBin, process.platform === 'win32' ? 'codex.cmd' : 'codex');

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

    assert.deepEqual(parsed.args.slice(0, 4), ['mcp', 'add', 'gitnexus', '--']);
    assert.ok(parsed.args.includes(expectedMcpPackage));
    assert.ok(parsed.args.includes('mcp'));
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
    await fs.rm(fakeBin, { recursive: true, force: true });
  }
});

test('setup configures OpenCode MCP in ~/.config/opencode/opencode.json', async () => {
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

    assert.equal(opencodeConfig.mcp?.gitnexus?.type, 'local');
    assert.deepEqual(opencodeConfig.mcp?.gitnexus?.command, ['npx', '-y', expectedMcpPackage, 'mcp']);
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});

test('setup keeps using legacy ~/.config/opencode/config.json when it already exists', async () => {
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

    assert.equal(legacyConfig.existing, true);
    assert.equal(legacyConfig.mcp?.gitnexus?.type, 'local');
    assert.deepEqual(legacyConfig.mcp?.gitnexus?.command, ['npx', '-y', expectedMcpPackage, 'mcp']);
    await assert.rejects(fs.access(preferredConfigPath));
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});

test('setup --agent opencode does not install Claude hooks', async () => {
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

    await assert.rejects(fs.access(claudeSettingsPath));
    await assert.rejects(fs.access(claudeHookPath));
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});

test('setup --scope project --agent claude writes only .mcp.json', async () => {
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
    const projectMcp = JSON.parse(projectMcpRaw) as { mcpServers?: Record<string, { command?: string }> };

    assert.equal(projectMcp.mcpServers?.gitnexus?.command, 'npx');
    await assert.rejects(fs.access(codexConfigPath));
    await assert.rejects(fs.access(opencodeConfigPath));
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
    await fs.rm(fakeRepo, { recursive: true, force: true });
  }
});

test('setup --scope project --agent codex writes only .codex/config.toml', async () => {
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

    assert.match(codexConfigRaw, /\[mcp_servers\.gitnexus\]/);
    assert.match(codexConfigRaw, /command = "npx"/);
    await assert.rejects(fs.access(projectMcpPath));
    await assert.rejects(fs.access(opencodeConfigPath));
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
    await fs.rm(fakeRepo, { recursive: true, force: true });
  }
});

test('setup --scope project --agent opencode writes only opencode.json', async () => {
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

    assert.equal(opencodeConfig.mcp?.gitnexus?.type, 'local');
    assert.deepEqual(opencodeConfig.mcp?.gitnexus?.command, ['npx', '-y', expectedMcpPackage, 'mcp']);
    await assert.rejects(fs.access(projectMcpPath));
    await assert.rejects(fs.access(codexConfigPath));
    await fs.access(localSkillPath);
    await assert.rejects(fs.access(globalSkillPath));
    assert.equal(config.setupScope, 'project');
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
    await fs.rm(fakeRepo, { recursive: true, force: true });
  }
});
