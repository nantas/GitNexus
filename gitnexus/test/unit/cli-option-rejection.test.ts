import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

const CLI_PATH = path.resolve('dist/cli/index.js');

describe('CLI removed options rejection', () => {
  it('rejects --sync-manifest-policy on analyze', () => {
    try {
      execSync(`node ${CLI_PATH} analyze --sync-manifest-policy update`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      expect.fail('Expected non-zero exit code');
    } catch (error: any) {
      expect(error.status).not.toBe(0);
      const output = error.stderr || error.stdout || '';
      expect(output).toMatch(/unknown option|error/i);
    }
  });

  it('rejects --scope-manifest on analyze', () => {
    try {
      execSync(`node ${CLI_PATH} analyze --scope-manifest foo.txt`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      expect.fail('Expected non-zero exit code');
    } catch (error: any) {
      expect(error.status).not.toBe(0);
      const output = error.stderr || error.stdout || '';
      expect(output).toMatch(/unknown option|error/i);
    }
  });

  it('rejects --scope-prefix on analyze', () => {
    try {
      execSync(`node ${CLI_PATH} analyze --scope-prefix Assets/`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      expect.fail('Expected non-zero exit code');
    } catch (error: any) {
      expect(error.status).not.toBe(0);
      const output = error.stderr || error.stdout || '';
      expect(output).toMatch(/unknown option|error/i);
    }
  });

  it('rejects --scope-manifest on benchmark-unity', () => {
    try {
      execSync(`node ${CLI_PATH} benchmark-unity /tmp/dataset --scope-manifest foo.txt`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      expect.fail('Expected non-zero exit code');
    } catch (error: any) {
      expect(error.status).not.toBe(0);
      const output = error.stderr || error.stdout || '';
      expect(output).toMatch(/unknown option|error/i);
    }
  });

  it('rejects --scope-prefix on benchmark-unity', () => {
    try {
      execSync(`node ${CLI_PATH} benchmark-unity /tmp/dataset --scope-prefix Assets/`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      expect.fail('Expected non-zero exit code');
    } catch (error: any) {
      expect(error.status).not.toBe(0);
      const output = error.stderr || error.stdout || '';
      expect(output).toMatch(/unknown option|error/i);
    }
  });
});
