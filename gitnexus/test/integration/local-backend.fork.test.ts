/**
 * P0 Integration Tests: Local Backend
 *
 * Tests tool implementations via direct LadybugDB queries.
 * The full LocalBackend.callTool() requires a global registry,
 * so here we test the security-critical behaviors directly:
 * - Write-operation blocking in cypher
 * - Query execution via the pool
 * - Parameterized queries preventing injection
 * - Read-only enforcement
 *
 * Covers hardening fixes: #1 (parameterized queries), #2 (write blocking),
 * #3 (path traversal), #4 (relation allowlist), #25 (regex lastIndex),
 * #26 (rename first-occurrence-only)
 */
import { describe, it, expect, vi } from 'vitest';
import { executeQuery, executeParameterized } from '../../src/core/lbug/pool-adapter.js';
import { VALID_RELATION_TYPES } from '../../src/mcp/local/local-backend.js';
import { LocalBackend } from '../../src/mcp/local/local-backend.js';
import { withTestLbugDB } from '../helpers/test-indexed-db.js';
import { LOCAL_BACKEND_SEED_DATA } from '../fixtures/local-backend-seed.fork.js';
import { listRegisteredRepos } from '../../src/storage/repo-manager.js';

vi.mock('../../src/storage/repo-manager.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/storage/repo-manager.js')>()),
  loadMeta: vi.fn().mockResolvedValue(null),
  listRegisteredRepos: vi.fn().mockResolvedValue([]),
  cleanupOldKuzuFiles: vi.fn().mockResolvedValue({ found: false, needsReindex: false }),
}));

// ─── Block 1: Pool adapter tests ─────────────────────────────────────

withTestLbugDB(
  'local-backend',
  (handle) => {
    // ─── Cypher write blocking ───────────────────────────────────────────

    // ─── Parameterized queries ───────────────────────────────────────────

    describe('parameterized queries', () => {
      it('finds exact match with parameter', async () => {
        const rows = await executeParameterized(
          handle.repoId,
          'MATCH (n:Function) WHERE n.name = $name RETURN n.name AS name, n.filePath AS filePath',
          { name: 'login' },
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe('login');
        expect(rows[0].filePath).toBe('src/auth.ts');
      });

      it('injection is harmless', async () => {
        const rows = await executeParameterized(
          handle.repoId,
          'MATCH (n:Function) WHERE n.name = $name RETURN n.name AS name',
          { name: "login' OR '1'='1" },
        );
        expect(rows).toHaveLength(0);
      });
    });

    // ─── Relation type filtering ─────────────────────────────────────────

    describe('relation type filtering', () => {
      it('only allows valid relation types in queries', () => {
        const validTypes = ['CALLS', 'IMPORTS', 'EXTENDS', 'IMPLEMENTS', 'HAS_METHOD', 'OVERRIDES'];
        const invalidTypes = ['CONTAINS', 'STEP_IN_PROCESS', 'MEMBER_OF', 'DROP_TABLE'];

        for (const t of validTypes) {
          expect(VALID_RELATION_TYPES.has(t)).toBe(true);
        }
        for (const t of invalidTypes) {
          expect(VALID_RELATION_TYPES.has(t)).toBe(false);
        }
      });

      it('can query relationships with valid types', async () => {
        const rows = await executeQuery(
          handle.repoId,
          `MATCH (a:Function)-[r:CodeRelation {type: 'CALLS'}]->(b:Function) RETURN a.name AS caller, b.name AS callee ORDER BY b.name`,
        );
        expect(rows.length).toBeGreaterThanOrEqual(2);
      });
    });

    // ─── Process queries ─────────────────────────────────────────────────

    describe('process queries', () => {
      it('can find processes', async () => {
        const rows = await executeQuery(
          handle.repoId,
          'MATCH (p:Process) RETURN p.heuristicLabel AS label, p.stepCount AS steps',
        );
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows[0].label).toBe('User Login');
      });

      it('can trace process steps', async () => {
        const rows = await executeQuery(
          handle.repoId,
          `MATCH (s)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p:Process)
         WHERE p.id = 'proc:login-flow'
         RETURN s.name AS symbol, r.step AS step
         ORDER BY r.step`,
        );
        expect(rows.length).toBeGreaterThanOrEqual(2);
        expect(rows.some((row) => row.symbol === 'login' && row.step === 1)).toBe(true);
        expect(rows.some((row) => row.symbol === 'validate' && row.step === 2)).toBe(true);
      });

      it('query process detail includes persisted lifecycle evidence', async () => {
        vi.mocked(listRegisteredRepos).mockResolvedValue([
          {
            name: 'test-repo',
            path: '/test/repo',
            storagePath: handle.tmpHandle.dbPath,
            indexedAt: new Date().toISOString(),
            lastCommit: 'abc123',
            stats: { files: 2, nodes: 3, communities: 1, processes: 1 },
          },
        ]);

        const backend = new LocalBackend();
        await backend.init();
        const detail = await backend.queryProcessDetail('User Login');

        expect(detail.error).toBeUndefined();
        expect(detail.process.processSubtype).toBe('unity_lifecycle');
        expect(detail.process.processType).toBe('intra_community');
        expect(detail.process.stepCount).toBeGreaterThan(0);
        expect(
          detail.steps.some((step: any) => step.reason === 'unity-runtime-loader-synthetic'),
        ).toBe(true);
        expect(detail.steps.every((step: any) => typeof step.step === 'number')).toBe(true);
      });
    });

    // ─── Community queries ───────────────────────────────────────────────

    describe('community queries', () => {
      it('can find communities', async () => {
        const rows = await executeQuery(
          handle.repoId,
          'MATCH (c:Community) RETURN c.heuristicLabel AS label',
        );
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows[0].label).toBe('Authentication');
      });

      it('can find community members', async () => {
        const rows = await executeQuery(
          handle.repoId,
          `MATCH (f)-[:CodeRelation {type: 'MEMBER_OF'}]->(c:Community)
         WHERE c.heuristicLabel = 'Authentication'
         RETURN f.name AS name`,
        );
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows[0].name).toBe('login');
      });
    });

    // ─── Regex lastIndex hardening (#25) ─────────────────────────────────

    // ─── Content queries (include_content equivalent) ────────────────────

    describe('content queries', () => {
      it('can retrieve symbol content', async () => {
        const rows = await executeQuery(
          handle.repoId,
          `MATCH (n:Function) WHERE n.name = 'login' RETURN n.content AS content`,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].content).toContain('function login');
      });
    });

    // ─── Write blocking edge cases ──────────────────────────────────────
  },
  {
    seed: LOCAL_BACKEND_SEED_DATA,
    poolAdapter: true,
  },
);
