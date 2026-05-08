/**
 * P0 Integration Tests: Local Backend — callTool dispatch
 *
 * Tests the full LocalBackend.callTool() dispatch with a real LadybugDB
 * instance, verifying cypher, context, impact, and query tools work
 * end-to-end against seeded graph data with FTS indexes.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalBackend } from '../../src/mcp/local/local-backend.js';
import { readResource } from '../../src/mcp/resources.js';
import { listRegisteredRepos } from '../../src/storage/repo-manager.js';
import { promoteCuratedRules } from '../../src/rule-lab/promote.js';
import { withTestLbugDB } from '../helpers/test-indexed-db.js';
import {
  LOCAL_BACKEND_SEED_DATA,
  LOCAL_BACKEND_FTS_INDEXES,
} from '../fixtures/local-backend-seed.js';

vi.mock('../../src/storage/repo-manager.js', () => ({
  listRegisteredRepos: vi.fn().mockResolvedValue([]),
  cleanupOldKuzuFiles: vi.fn().mockResolvedValue({ found: false, needsReindex: false }),
  findSiblingClones: vi.fn().mockResolvedValue([]),
}));

// ─── Block 2: callTool dispatch tests ────────────────────────────────

withTestLbugDB(
  'local-backend-calltool',
  (handle) => {
    describe('callTool dispatch with real DB', () => {
      let backend: LocalBackend;

      beforeAll(async () => {
        // backend is created in afterSetup and attached to the handle
        const ext = handle as typeof handle & { _backend?: LocalBackend };
        if (!ext._backend) {
          throw new Error(
            'LocalBackend not initialized — afterSetup did not attach _backend to handle',
          );
        }
        backend = ext._backend;
      });

      it('cypher tool returns function names', async () => {
        const result = await backend.callTool('cypher', {
          query: 'MATCH (n:Function) RETURN n.name AS name ORDER BY n.name',
        });
        // cypher tool wraps results as markdown
        expect(result).toHaveProperty('markdown');
        expect(result).toHaveProperty('row_count');
        expect(result.row_count).toBeGreaterThanOrEqual(3);
        expect(result.markdown).toContain('login');
        expect(result.markdown).toContain('validate');
        expect(result.markdown).toContain('hash');
      });

    it('context tool returns symbol info with callers and callees', async () => {
      const result = await backend.callTool('context', {
 response_profile: 'full', name: 'login' });
      expect(result).not.toHaveProperty('error');
      expect(result.status).toBe('found');
      // Should have the symbol identity
      expect(result.symbol).toBeDefined();
      expect(result.symbol.name).toBe('login');
      expect(result.symbol.filePath).toBe('src/auth.ts');
      // login calls validate and hash — should appear in outgoing.calls
      expect(result.outgoing).toBeDefined();
      expect(result.outgoing.calls).toBeDefined();
      expect(result.outgoing.calls.length).toBeGreaterThanOrEqual(2);
      const calleeNames = result.outgoing.calls.map((c: any) => c.name);
      expect(calleeNames).toContain('validate');
      expect(calleeNames).toContain('hash');
    });

    it('context tool aggregates method-level relations for class symbols and keeps direct relations separate', async () => {
      const result = await backend.callTool('context', {
 response_profile: 'full', name: 'AuthService' });
      expect(result).not.toHaveProperty('error');
      expect(result.status).toBe('found');
      expect(result.symbol.name).toBe('AuthService');

      // Aggregated via HAS_METHOD -> method CALLS graph
      expect(result.incoming?.calls?.map((r: any) => r.name)).toContain('login');
      expect(result.outgoing?.calls?.map((r: any) => r.name)).toContain('validate');

      // Direct class-level relations remain available and separate.
      expect(result.directIncoming).toBeDefined();
      expect(result.directOutgoing).toBeDefined();
      expect(result.directIncoming.calls || []).toHaveLength(0);
      expect(result.directOutgoing.calls || []).toHaveLength(0);
    });

    it('context tool projects method-level process participation for class symbols', async () => {
      const result = await backend.callTool('context', {
 response_profile: 'full', name: 'AuthService' });

      expect(result.processes?.length).toBeGreaterThan(0);
      expect(result.processes.some((p: any) => p.evidence_mode === 'method_projected')).toBe(true);
      expect(result.processes.every((p: any) => ['high', 'medium'].includes(p.confidence))).toBe(true);
      expect(result.processes.some((p: any) => p.evidence_mode === 'direct_step')).toBe(false);
    });

    it('impact tool returns upstream dependents', async () => {
      const result = await backend.callTool('impact', {
        target: 'validate',
        direction: 'upstream',
      });

    it('impact honors target_uid disambiguation over target name', async () => {
      const result = await backend.callTool('impact', {
        target: 'definitely-not-a-real-symbol-name',
        target_uid: 'func:validate',
        direction: 'upstream',
      });
      expect(result).not.toHaveProperty('error');
      expect(result.target.id).toBe('func:validate');
      expect(result.target.name).toBe('validate');
    });

    it('impact honors file_path disambiguation for duplicate symbol names', async () => {
      const result = await backend.callTool('impact', {
        target: 'authenticate',
        file_path: 'src/base.ts',
        direction: 'downstream',
        relationTypes: ['OVERRIDES'],
      });
      expect(result).not.toHaveProperty('error');
      expect(result.target.name).toBe('authenticate');
      expect(result.target.filePath).toBe('src/base.ts');
    });

    it('query tool returns results for keyword search', async () => {
      const result = await backend.callTool('query', {
 response_profile: 'full', query: 'login' });
      expect(result).not.toHaveProperty('error');
      // Should have some combination of processes, process_symbols, or definitions
      expect(result).toHaveProperty('processes');
      expect(result).toHaveProperty('definitions');
      // The search should find something (FTS or graph-based)
      const totalResults =
        (result.processes?.length || 0) +
        (result.process_symbols?.length || 0) +
        (result.definitions?.length || 0);
      expect(totalResults).toBeGreaterThanOrEqual(1);
    });

    it('query tool projects class hits into processes via method STEP_IN_PROCESS', async () => {
      const result = await backend.callTool('query', {
 response_profile: 'full', query: 'AuthService' });

      expect(result.processes?.length).toBeGreaterThan(0);
      expect(result.process_symbols.some((s: any) => s.name === 'AuthService')).toBe(true);
      expect(result.processes.some((p: any) => p.evidence_mode === 'method_projected')).toBe(true);
    });

    it('query keeps direct evidence as high confidence when available', async () => {
      const result = await backend.callTool('query', {
 response_profile: 'full', query: 'authenticate' });
      const directHigh = result.process_symbols.find(
        (s: any) => s.process_evidence_mode === 'direct_step' && s.process_confidence === 'high',
      );

      expect(directHigh).toBeDefined();
    });

    it('phase1 process_ref readable', async () => {
      const out = await backend.callTool('query', {
response_profile: 'full',
        query: 'login',
      });

      expect(out.processes.length).toBeGreaterThan(0);
      expect(out.processes.every((p: any) => p.process_ref && p.process_ref.readable === true)).toBe(true);

      const persistentReaderUris = out.processes
        .map((p: any) => p?.process_ref)
        .filter((ref: any) => ref?.kind === 'persistent' && typeof ref.reader_uri === 'string')
        .map((ref: any) => ref.reader_uri);
      expect(persistentReaderUris.length).toBeGreaterThan(0);

      for (const uri of persistentReaderUris) {
        const content = await readResource(uri, backend);
        expect(content).toContain('trace:');
      }
    });

    it('phase1 process detail supports direct id read', async () => {
      const detail = await backend.queryProcessDetail('proc:login-flow', 'test-repo');
      expect(detail.error).toBeUndefined();
      expect(detail.process?.id).toBe('proc:login-flow');
    });

    it('phase1 no opaque heuristic id leak', async () => {
      const out = await backend.callTool('query', {
response_profile: 'full',
        query: 'Reload',
        unity_resources: 'on',
        unity_hydration_mode: 'compact',
      });

      expect(out.processes.some((p: any) => String(p.id || '').startsWith('proc:heuristic:'))).toBe(false);
    });

    it('phase5 confidence fields and verification hints', async () => {
      const original = process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
      process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = 'on';
      try {
        const on = await backend.callTool('context', {
 response_profile: 'full', name: 'AuthService' });
        expect(on.processes.length).toBeGreaterThan(0);
        expect(on.processes.every((p: any) => ['high', 'medium', 'low'].includes(p.confidence))).toBe(true);
        expect(on.processes.some((p: any) => Object.prototype.hasOwnProperty.call(p, 'verification_hint'))).toBe(true);

        const low = on.processes.find((p: any) => p.confidence === 'low');
        if (low) {
          expect(low.verification_hint).toHaveProperty('action');
          expect(low.verification_hint).toHaveProperty('target');
          expect(low.verification_hint).toHaveProperty('next_command');
        }
      } finally {
        if (original === undefined) {
          delete process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
        } else {
          process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = original;
        }
      }
    });

    it('phase5 flag-off preserves legacy response shape', async () => {
      const original = process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
      process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = 'off';
      try {
        const off = await backend.callTool('context', {
 response_profile: 'full', name: 'AuthService' });
        expect(off.processes.length).toBeGreaterThan(0);
        expect(off.processes.every((p: any) => p.verification_hint === undefined)).toBe(true);
        expect(off.processes.every((p: any) => typeof p.step_count === 'number')).toBe(true);
      } finally {
        if (original === undefined) {
          delete process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
        } else {
          process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = original;
        }
      }
    });

    it('query no longer injects heuristic rows when processRows is empty', async () => {
      const original = process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
      process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = 'on';
      try {
        const result = await backend.callTool('query', {
          query: 'Reload',
          response_profile: 'full',
          unity_resources: 'on',
          unity_hydration_mode: 'compact',
        });

        expect(result.processes.some((p: any) => p.evidence_mode === 'resource_heuristic')).toBe(false);
        expect(Array.isArray(result.resource_hints || result.next_hops || [])).toBe(true);
      } finally {
        if (original === undefined) {
          delete process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
        } else {
          process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = original;
        }
      }
    });

    it('context no longer injects heuristic rows when processRows is empty', async () => {
      const original = process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
      process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = 'on';
      try {
        const out = await backend.callTool('context', {
          name: 'ReloadBase',
          file_path: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
          response_profile: 'full',
          unity_resources: 'on',
          unity_hydration_mode: 'parity',
        });

        expect(out.processes.some((p: any) => p.evidence_mode === 'resource_heuristic')).toBe(false);
        expect(Array.isArray(out.resource_hints || out.next_hops || [])).toBe(true);
      } finally {
        if (original === undefined) {
          delete process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
        } else {
          process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = original;
        }
      }
    });

    it('context returns graph-backed Unity scene-prefab-script resource chains', async () => {
      const out = await backend.callTool('context', {
        name: 'BattleMode',
        file_path: 'Assets/NEON/Code/Game/GameModes/BattleMode/BattleMode.cs',
        response_profile: 'full',
        unity_resources: 'on',
        unity_hydration_mode: 'parity',
        resource_path_prefix: 'Assets/NEON/Scene/BattleModeScenes/BattleMode.unity',
      });

      expect(out.status).toBe('found');
      expect(out.resource_chains).toHaveLength(1);
      expect(out.resource_chains[0]).toMatchObject({
        sourceResourcePath: 'Assets/NEON/Scene/BattleModeScenes/BattleMode.unity',
        relationType: 'UNITY_ASSET_GUID_REF',
        intermediateResourcePath: 'Assets/NEON/Prefab/Systems/BattleMode.prefab',
        nextRelationType: 'UNITY_GRAPH_NODE_SCRIPT_REF',
        targetSymbol: {
          name: 'BattleMode',
          filePath: 'Assets/NEON/Code/Game/GameModes/BattleMode/BattleMode.cs',
        },
      });
    });

    it('query returns exact graph-backed Unity resource chain for symbol-like queries', async () => {
      const out = await backend.callTool('query', {
        query: 'BattleMode',
        response_profile: 'full',
        unity_resources: 'on',
        unity_hydration_mode: 'parity',
        resource_path_prefix: 'Assets/NEON/Scene/BattleModeScenes/BattleMode.unity',
      });

      expect(out.resource_chains).toHaveLength(1);
      expect(out.resource_chains[0].targetSymbol).toMatchObject({
        name: 'BattleMode',
        filePath: 'Assets/NEON/Code/Game/GameModes/BattleMode/BattleMode.cs',
      });
    });

    it('v1 dual layer confidence fields', async () => {
      const original = process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
      process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = 'on';
      try {
        const q = await backend.callTool('query', {
response_profile: 'full',
          query: 'Reload',
          unity_resources: 'on',
          unity_hydration_mode: 'parity',
        });
        expect(Array.isArray(q.processes)).toBe(true);
        if (q.processes.length > 0) {
          expect(q.processes.some((p: any) => p.runtime_chain_evidence_level)).toBe(true);
        }

        const c = await backend.callTool('context', {
response_profile: 'full',
          name: 'ReloadBase',
          file_path: 'Assets/NEON/Code/Game/Graph/Nodes/Reloads/ReloadBase.cs',
          unity_resources: 'on',
          unity_hydration_mode: 'parity',
        });
        expect(Array.isArray(c.processes)).toBe(true);
        if (c.processes.length > 0) {
          expect(c.processes.some((p: any) => p.runtime_chain_evidence_level)).toBe(true);
        }
      } finally {
        if (original === undefined) {
          delete process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
        } else {
          process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = original;
        }
      }
    });

    it('v1 low confidence hints remain actionable', async () => {
      const original = process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
      process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = 'on';
      try {
        const result = await backend.callTool('query', {
response_profile: 'full',
          query: 'Reload',
          unity_resources: 'on',
          unity_hydration_mode: 'parity',
        });
        const low = result.processes.find((p: any) => p.confidence === 'low');
        if (low) {
          expect(low.verification_hint?.action).toBeTruthy();
          expect(low.verification_hint?.target).toBeTruthy();
          expect(low.verification_hint?.next_command).toBeTruthy();
        } else {
          expect(result.processes.some((p: any) => p.evidence_mode === 'resource_heuristic')).toBe(false);
        }
      } finally {
        if (original === undefined) {
          delete process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS;
        } else {
          process.env.GITNEXUS_UNITY_PROCESS_CONFIDENCE_FIELDS = original;
        }
      }
    });

    it('v1 runtime chain verify on demand', async () => {
      const out = await backend.callTool('query', {
response_profile: 'full',
        query: 'Reload NEON.Game.Graph.Nodes.Reloads',
        unity_resources: 'on',
        unity_hydration_mode: 'parity',
        runtime_chain_verify: 'on-demand',
      });
      expect(out.runtime_chain).toBeDefined();
      expect(Array.isArray(out.runtime_chain.hops)).toBe(true);
      expect(out.runtime_claim).toBeDefined();
      expect([
        'rule_not_matched',
        'rule_matched_but_evidence_missing',
        'rule_matched_but_verification_failed',
      ]).toContain(out.runtime_claim.reason);
    });

    it('phase2 runtime_claim contract', async () => {
      const out = await backend.callTool('query', {
response_profile: 'full',
        query: 'Reload NEON.Game.Graph.Nodes.Reloads',
        unity_resources: 'on',
        unity_hydration_mode: 'parity',
        runtime_chain_verify: 'on-demand',
      });

      expect(out.runtime_claim).toBeDefined();
      expect(out.runtime_claim.rule_id).toBe('graph-only.runtime-closure.v1');
      expect(out.runtime_claim.rule_version).toBeTruthy();
      expect(out.runtime_claim.scope).toBeDefined();
      expect(Array.isArray(out.runtime_claim.guarantees)).toBe(true);
      expect(Array.isArray(out.runtime_claim.non_guarantees)).toBe(true);
      expect(out.runtime_claim.non_guarantees.length).toBeGreaterThan(0);
      expect([
        'rule_not_matched',
        'rule_matched_but_evidence_missing',
        'rule_matched_but_verification_failed',
      ]).toContain(out.runtime_claim.reason);
      expect(out.runtime_claim.next_action).toBeTruthy();
      expect(['verified_full', 'failed']).toContain(out.runtime_claim.verification_core_status);
      expect(out.runtime_claim.verification_core_evidence_level).toBeTruthy();
      expect(typeof out.runtime_claim.policy_adjusted).toBe('boolean');
    });

    it('phase5 rule-lab promoted rule is loadable', async () => {
      const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'phase5-rule-lab-calltool-'));
      const runId = 'run-x';
      const sliceId = 'slice-a';
      const sliceDir = path.join(repoPath, '.gitnexus', 'rules', 'lab', 'runs', runId, 'slices', sliceId);
      await fs.mkdir(sliceDir, { recursive: true });
      await fs.writeFile(
        path.join(sliceDir, 'curated.json'),
        JSON.stringify({
          run_id: runId,
          slice_id: sliceId,
          curated: [
            {
              id: 'candidate-startup-1',
              rule_id: 'demo.startup.v1',
              title: 'startup startup graph',
              confirmed_chain: {
                steps: [{ hop_type: 'code_runtime', anchor: 'Assets/Rules/startup.asset:1', snippet: 'Startup Graph Trigger' }],
              },
              guarantees: ['startup trigger matching is confirmed'],
              non_guarantees: ['does not prove full runtime ordering'],
            },
          ],
        }, null, 2),
        'utf-8',
      );
      await promoteCuratedRules({ repoPath, runId, sliceId, version: '1.0.0' });

      try {
        vi.mocked(listRegisteredRepos).mockResolvedValue([
          {
            name: 'test-repo',
            path: '/test/repo',
            storagePath: handle.tmpHandle.dbPath,
            indexedAt: new Date().toISOString(),
            lastCommit: 'abc123',
            stats: { files: 2, nodes: 3, communities: 1, processes: 1 },
          },
          {
            name: 'phase5-rule-lab-repo',
            path: repoPath,
            storagePath: handle.tmpHandle.dbPath,
            indexedAt: new Date().toISOString(),
            lastCommit: 'abc123',
            stats: { files: 2, nodes: 3, communities: 1, processes: 1 },
          },
        ]);

        const out = await backend.callTool('query', {
response_profile: 'full',
          repo: 'phase5-rule-lab-repo',
          query: 'Startup Graph Trigger',
          unity_resources: 'on',
          runtime_chain_verify: 'on-demand',
        });
        expect(out.runtime_claim?.rule_id).toBe('graph-only.runtime-closure.v1');
        expect(out.runtime_claim?.reason).toBeTruthy();
      } finally {
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
        await fs.rm(repoPath, { recursive: true, force: true });
      }
    });

    it('phase2 failure classifications', async () => {
      const unmatched = await backend.callTool('query', {
response_profile: 'full',
        query: 'UnrelatedUnityChain',
        unity_resources: 'on',
        runtime_chain_verify: 'on-demand',
      });
      const allowedReasons = [
        'rule_not_matched',
        'rule_matched_but_evidence_missing',
        'rule_matched_but_verification_failed',
      ];
      expect(unmatched.runtime_claim?.status).toBe('failed');
      expect(allowedReasons).toContain(unmatched.runtime_claim?.reason);
      if (unmatched.runtime_claim?.reason === 'rule_matched_but_evidence_missing') {
        expect(Array.isArray(unmatched.runtime_claim?.gaps)).toBe(true);
        expect(unmatched.runtime_claim?.gaps?.length || 0).toBeGreaterThan(0);
      }
      expect(unmatched.runtime_claim?.next_action).toBeTruthy();
    });

    it('phase2 no cross-repo bootstrap fallback', async () => {
      const out = await backend.callTool('query', {
response_profile: 'full',
        query: 'Reload',
        unity_resources: 'on',
        runtime_chain_verify: 'on-demand',
      });
      expect(out.runtime_claim?.rule_id).toBe('graph-only.runtime-closure.v1');
      expect([
        'rule_not_matched',
        'rule_matched_but_evidence_missing',
        'rule_matched_but_verification_failed',
      ]).toContain(out.runtime_claim?.reason);
    });

    it('phase3 evidence mode', async () => {
      const out = await backend.callTool('query', {
response_profile: 'full',
        query: 'Reload',
        unity_resources: 'on',
        unity_evidence_mode: 'summary',
        max_bindings: 1,
        max_reference_fields: 1,
      });
      expect(out.evidence_meta?.truncated).toBe(true);
      expect(out.evidence_meta?.omitted_count).toBeGreaterThan(0);
      expect(out.evidence_meta?.next_fetch_hint).toMatch(/unity_evidence_mode=full/i);
    });

    it('phase3 minimum evidence contract (no project rules => rule_not_matched)', async () => {
      const out = await backend.callTool('query', {
response_profile: 'full',
        query: 'Reload',
        unity_resources: 'on',
        unity_evidence_mode: 'summary',
        max_bindings: 1,
        max_reference_fields: 1,
        runtime_chain_verify: 'on-demand',
      });
      expect(out.runtime_claim?.status).toBe('failed');
      expect([
        'rule_not_matched',
        'rule_matched_but_evidence_missing',
      ]).toContain(out.runtime_claim?.reason);
    });

    it('phase4 hydration policy', async () => {
      const strict = await backend.callTool('query', {
response_profile: 'full',
        query: 'Reload',
        unity_resources: 'on',
        hydration_policy: 'strict',
        unity_hydration_mode: 'compact',
        runtime_chain_verify: 'on-demand',
      });
      expect(strict.hydrationMeta?.requestedMode).toBe('parity');
      expect(typeof strict.hydrationMeta?.effectiveMode).toBe('string');
      expect(String(strict.hydrationMeta?.reason || '')).toMatch(/strict/i);
      expect(['verified_full', 'failed']).toContain(strict.runtime_claim?.verification_core_status);
      expect(strict.runtime_claim?.verification_core_evidence_level).toBeTruthy();
      expect(typeof strict.runtime_claim?.policy_adjusted).toBe('boolean');
      if (strict.hydrationMeta?.fallbackToCompact && strict.runtime_claim?.status !== 'failed') {
        expect(strict.runtime_claim?.verification_core_status).toBe('verified_full');
        expect(strict.runtime_claim?.status).toBe('verified_partial');
        expect(strict.runtime_claim?.evidence_level).toBe('verified_segment');
        expect(strict.runtime_claim?.policy_adjusted).toBe(true);
      }
      expect(Array.isArray(strict.missing_evidence)).toBe(true);

      const balancedParity = await backend.callTool('query', {
response_profile: 'full',
        query: 'Reload',
        unity_resources: 'on',
        hydration_policy: 'balanced',
        unity_hydration_mode: 'parity',
      });
      expect(balancedParity.hydrationMeta?.requestedMode).toBe('parity');

      const fastParity = await backend.callTool('query', {
response_profile: 'full',
        query: 'Reload',
        unity_resources: 'on',
        hydration_policy: 'fast',
        unity_hydration_mode: 'parity',
      });
      expect(fastParity.hydrationMeta?.requestedMode).toBe('compact');
      expect(String(fastParity.hydrationMeta?.reason || '')).toMatch(/fast/i);
    });

    it('runtime claim core vs adjusted metadata is stable in context()', async () => {
      const out = await backend.callTool('context', {
response_profile: 'full',
        name: 'ReloadBase',
        unity_resources: 'on',
        hydration_policy: 'strict',
        unity_hydration_mode: 'compact',
        runtime_chain_verify: 'on-demand',
      });

      expect(out.runtime_claim).toBeDefined();
      expect(['verified_full', 'failed']).toContain(out.runtime_claim?.verification_core_status);
      expect(out.runtime_claim?.verification_core_evidence_level).toBeTruthy();
      expect(typeof out.runtime_claim?.policy_adjusted).toBe('boolean');
      if (out.hydrationMeta?.fallbackToCompact && out.runtime_claim?.status !== 'failed') {
        expect(out.runtime_claim?.verification_core_status).toBe('verified_full');
        expect(out.runtime_claim?.status).toBe('verified_partial');
        expect(out.runtime_claim?.evidence_level).toBe('verified_segment');
        expect(out.runtime_claim?.policy_adjusted).toBe(true);
      }
    });

    it('phase4 missing_evidence and needsParityRetry', async () => {
      const fast = await backend.callTool('query', {
response_profile: 'full',
        query: 'Reload',
        unity_resources: 'on',
        hydration_policy: 'fast',
      });
      expect(Array.isArray(fast.missing_evidence)).toBe(true);
      if (fast.hydrationMeta?.isComplete === false) {
        expect(typeof fast.hydrationMeta.needsParityRetry).toBe('boolean');
      }
    });

    it('v1 runtime chain verify always runs when requested', async () => {
      const out = await backend.callTool('query', {
response_profile: 'full',
        query: 'Reload NEON.Game.Graph.Nodes.Reloads',
        unity_resources: 'on',
        unity_hydration_mode: 'parity',
        runtime_chain_verify: 'on-demand',
      });
      expect(out.runtime_chain).toBeDefined();
      expect(out.runtime_claim).toBeDefined();
    });

    it('returns lifecycle process metadata without breaking legacy fields', async () => {
      const queryResult = await backend.callTool('query', {
 response_profile: 'full', query: 'login' });
      expect(queryResult.processes.some((p: any) => p.process_subtype === 'unity_lifecycle')).toBe(true);
      expect(queryResult.processes.every((p: any) => typeof p.step_count === 'number')).toBe(true);
      expect(queryResult.processes.every((p: any) => typeof p.process_type === 'string')).toBe(true);

      const contextResult = await backend.callTool('context', {
 response_profile: 'full', name: 'login' });
      expect(contextResult.processes.some((p: any) => p.process_subtype === 'unity_lifecycle')).toBe(true);
      expect(contextResult.processes.every((p: any) => typeof p.step_count === 'number')).toBe(true);
    });

    it('unknown tool throws', async () => {
      await expect(
        backend.callTool('nonexistent_tool', {}),
      ).rejects.toThrow(/unknown tool/i);
    });
  });

  describe('impact tool relationTypes filtering', () => {
    let backend: LocalBackend;

    beforeAll(async () => {
      const ext = handle as typeof handle & { _backend?: LocalBackend };
      if (!ext._backend) {
        throw new Error('LocalBackend not initialized — afterSetup did not attach _backend to handle');
      }
      backend = ext._backend;
    });

    it('filters by HAS_METHOD only', async () => {
      const result = await backend.callTool('impact', {
        target: 'AuthService',
        direction: 'downstream',
        relationTypes: ['HAS_METHOD'],
      });

      it('impact tool returns upstream dependents', async () => {
        const result = await backend.callTool('impact', {
          target: 'validate',
          direction: 'upstream',
        });
        expect(result).not.toHaveProperty('error');
        // validate is called by login, so login should appear at depth 1
        expect(result.impactedCount).toBeGreaterThanOrEqual(1);
        expect(result.byDepth).toBeDefined();
        const directDeps = result.byDepth[1] || result.byDepth['1'] || [];
        expect(directDeps.length).toBeGreaterThanOrEqual(1);
        const depNames = directDeps.map((d: any) => d.name);
        expect(depNames).toContain('login');
      });

      it('query tool returns results for keyword search', async () => {
        const result = await backend.callTool('query', { query: 'login' });
        expect(result).not.toHaveProperty('error');
        expect(result).toHaveProperty('processes');
        expect(result).toHaveProperty('definitions');
        expect(result.processes.map((p: any) => p.id)).toContain('proc:login-flow');
        expect(result.process_symbols.map((s: any) => s.id)).toContain('func:login');

        // #553: query response carries per-phase timing metadata.
        expect(result.timing).toBeDefined();
        expect(typeof result.timing.wall).toBe('number');
        expect(result.timing.wall).toBeGreaterThanOrEqual(0);
        // At least one of the search phases must have fired for any
        // non-error response — bm25 and/or vector always runs.
        expect(result.timing.bm25 ?? result.timing.vector).toBeGreaterThanOrEqual(0);
      });
      expect(result).not.toHaveProperty('error');
      // AuthService has no outgoing CALLS edges, only HAS_METHOD
      expect(result.impactedCount).toBe(0);
    });

    it('bridges class-target upstream traversal through HAS_METHOD by default', async () => {
      const result = await backend.callTool('impact', {
        target: 'AuthService',
        direction: 'upstream',
      });
      expect(result).not.toHaveProperty('error');
      const d1 = result.byDepth[1] || result.byDepth['1'] || [];
      const names = d1.map((d: any) => d.name);
      expect(names).toContain('login');
    });
  });

      it('tool_map returns per-tool flows without cross-attributing same-file tools', async () => {
        const result = await backend.callTool('tool_map', {});
        expect(result).not.toHaveProperty('error');

    beforeAll(async () => {
      const ext = handle as typeof handle & { _backend?: LocalBackend };
      if (!ext._backend) {
        throw new Error('LocalBackend not initialized — afterSetup did not attach _backend to handle');
      }
      backend = ext._backend;
    });

    it('context tool returns error for nonexistent symbol', async () => {
      const result = await backend.callTool('context', {
 response_profile: 'full', name: 'nonexistent_xyz_symbol_999' });
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/not found/i);
    });

    it('query tool returns error for empty query', async () => {
      const result = await backend.callTool('query', {
 response_profile: 'full', query: '' });
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/required/i);
    });

    it('query tool returns error for missing query param', async () => {
      const result = await backend.callTool('query', {
response_profile: 'full',});
      expect(result).toHaveProperty('error');
    });

    it('cypher tool returns error for invalid Cypher syntax', async () => {
      const result = await backend.callTool('cypher', { query: 'THIS IS NOT VALID CYPHER AT ALL' });
      expect(result).toHaveProperty('error');
    });

    it('context tool returns error when no name or uid provided', async () => {
      const result = await backend.callTool('context', {
response_profile: 'full',});
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/required/i);
    });

    // ─── impact error handling tests (#321) ───────────────────────────
    // Verify that impact() returns structured JSON instead of crashing

    it('impact tool returns structured error for unknown symbol', async () => {
      const result = await backend.callTool('impact', {
        target: 'nonexistent_symbol_xyz_999',
        direction: 'upstream',
      });

      it('unknown tool throws', async () => {
        await expect(backend.callTool('nonexistent_tool', {})).rejects.toThrow(/unknown tool/i);
      });
    });

    describe('impact tool relationTypes filtering', () => {
      let backend: LocalBackend;

      beforeAll(async () => {
        const ext = handle as typeof handle & { _backend?: LocalBackend };
        if (!ext._backend) {
          throw new Error(
            'LocalBackend not initialized — afterSetup did not attach _backend to handle',
          );
        }
        backend = ext._backend;
      });

      it('filters by HAS_METHOD only', async () => {
        const result = await backend.callTool('impact', {
          target: 'AuthService',
          direction: 'downstream',
          relationTypes: ['HAS_METHOD'],
        });
        expect(result).not.toHaveProperty('error');
        expect(result.impactedCount).toBeGreaterThanOrEqual(1);
        const d1 = result.byDepth[1] || result.byDepth['1'] || [];
        const names = d1.map((d: any) => d.name);
        expect(names).toContain('authenticate');
        // Should NOT include CALLS-reachable symbols like validate/hash
        expect(names).not.toContain('validate');
        expect(names).not.toContain('hash');
      });

      it('filters by OVERRIDES only', async () => {
        // The seed has two Method nodes named 'authenticate' (AuthService's
        // override and BaseService's base). Per #470, `impact` now returns
        // a ranked-ambiguous response when the target name hits multiple
        // symbols, so we must disambiguate with file_path to get the
        // AuthService override (the one with the outgoing METHOD_OVERRIDES
        // edge we want to follow downstream).
        const result = await backend.callTool('impact', {
          target: 'authenticate',
          file_path: 'src/auth.ts',
          direction: 'downstream',
          relationTypes: ['METHOD_OVERRIDES'],
        });
        expect(result).not.toHaveProperty('error');
        expect(result.status).not.toBe('ambiguous');
        // AuthService.authenticate overrides BaseService.authenticate
        expect(result.impactedCount).toBeGreaterThanOrEqual(1);
        const d1 = result.byDepth[1] || result.byDepth['1'] || [];
        const names = d1.map((d: any) => d.name);
        expect(names).toContain('authenticate');
      });

      it('expands legacy OVERRIDES to include METHOD_OVERRIDES (dual-read)', async () => {
        // Pass the LEGACY alias 'OVERRIDES' — impactByUid should flatMap-expand
        // it to ['OVERRIDES', 'METHOD_OVERRIDES'] so the METHOD_OVERRIDES edge
        // between BaseService.authenticate and AuthService.authenticate is found.
        // file_path hint disambiguates the two 'authenticate' methods per #470.
        const result = await backend.callTool('impact', {
          target: 'authenticate',
          file_path: 'src/auth.ts',
          direction: 'downstream',
          relationTypes: ['OVERRIDES'],
        });
        expect(result).not.toHaveProperty('error');
        expect(result.status).not.toBe('ambiguous');
        expect(result.impactedCount).toBeGreaterThanOrEqual(1);
        const d1 = result.byDepth[1] || result.byDepth['1'] || [];
        const names = d1.map((d: any) => d.name);
        expect(names).toContain('authenticate');
      });

      it('does not return HAS_METHOD results when filtering by CALLS only', async () => {
        const result = await backend.callTool('impact', {
          target: 'AuthService',
          direction: 'downstream',
          relationTypes: ['CALLS'],
        });
        expect(result).not.toHaveProperty('error');
        // AuthService has no outgoing CALLS edges, only HAS_METHOD
        expect(result.impactedCount).toBe(0);
      });
    });

    describe('tool parameter edge cases', () => {
      let backend: LocalBackend;

      beforeAll(async () => {
        const ext = handle as typeof handle & { _backend?: LocalBackend };
        if (!ext._backend) {
          throw new Error(
            'LocalBackend not initialized — afterSetup did not attach _backend to handle',
          );
        }
        backend = ext._backend;
      });

      it('context tool returns error for nonexistent symbol', async () => {
        const result = await backend.callTool('context', { name: 'nonexistent_xyz_symbol_999' });
        expect(result).toHaveProperty('error');
        expect(result.error).toMatch(/not found/i);
      });

      it('query tool returns error for empty query', async () => {
        const result = await backend.callTool('query', { query: '' });
        expect(result).toHaveProperty('error');
        expect(result.error).toMatch(/required/i);
      });

      it('query tool returns error for missing query param', async () => {
        const result = await backend.callTool('query', {});
        expect(result).toHaveProperty('error');
      });

      it('cypher tool returns error for invalid Cypher syntax', async () => {
        const result = await backend.callTool('cypher', {
          query: 'THIS IS NOT VALID CYPHER AT ALL',
        });
        expect(result).toHaveProperty('error');
      });

      it('context tool returns error when no name or uid provided', async () => {
        const result = await backend.callTool('context', {});
        expect(result).toHaveProperty('error');
        expect(result.error).toMatch(/required/i);
      });

      // ─── impact error handling tests (#321) ───────────────────────────
      // Verify that impact() returns structured JSON instead of crashing

      it('impact tool returns structured error for unknown symbol', async () => {
        const result = await backend.callTool('impact', {
          target: 'nonexistent_symbol_xyz_999',
          direction: 'upstream',
        });
        // Must return structured JSON, not throw
        expect(result).toBeDefined();
        // Should have either an error field (not found) or impactedCount 0
        // Either outcome is valid — the key is it doesn't crash
        if (result.error) {
          expect(typeof result.error).toBe('string');
        } else {
          expect(result.impactedCount).toBe(0);
        }
      });

      it('impact error response has consistent target shape', async () => {
        const result = await backend.callTool('impact', {
          target: 'nonexistent_symbol_xyz_999',
          direction: 'downstream',
        });
        // When an error is returned, target must be an object (not raw string)
        // so downstream API consumers can safely access result.target.name
        if (result.error && result.target !== undefined) {
          expect(typeof result.target).toBe('object');
          expect(result.target).not.toBeNull();
        }
      });

      it('impact partial results: traversalComplete flag when depth fails', async () => {
        // Even if traversal fails at some depth, partial results should be returned
        // and partial:true should only be set when some results were collected
        const result = await backend.callTool('impact', {
          target: 'validate',
          direction: 'upstream',
          maxDepth: 10, // Large depth to trigger multi-level traversal
        });
        // Should succeed (validate exists in seed data)
        expect(result).not.toHaveProperty('error');
        if (result.partial) {
          // If partial, must still have some results
          expect(result.impactedCount).toBeGreaterThan(0);
        }
      });
    });
  },
  {
    seed: LOCAL_BACKEND_SEED_DATA,
    ftsIndexes: LOCAL_BACKEND_FTS_INDEXES,
    poolAdapter: true,
    afterSetup: async (handle) => {
      // Configure listRegisteredRepos mock with handle values
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
      // Stash backend on handle so tests can access it
      (handle as any)._backend = backend;
    },
  },
);
