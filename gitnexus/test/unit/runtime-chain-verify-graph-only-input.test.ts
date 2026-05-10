import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyRuntimeClaimOnDemand } from '../../src/mcp/local/runtime-chain-verify.js';

function makeSyntheticExecutor() {
  return async (_query: string) => {
    return [];
  };
}

describe('runtime-chain graph-only input contract', () => {
  it('does not use queryText as primary verifier match signal', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-chain-graph-only-input-'));
    try {
      const out = await verifyRuntimeClaimOnDemand({
        repoPath: repoRoot,
        queryText: 'reload runtime chain',
        executeParameterized: makeSyntheticExecutor(),
      });

      expect(out.status).toBe('failed');
      expect(out.reason).toBe('rule_not_matched');
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });
});
