/**
 * Unit Tests: MCP Tool Definitions
 *
 * Tests: GITNEXUS_TOOLS from tools.ts
 * - All tools are defined
 * - Each tool has valid name, description, inputSchema
 * - Required fields are correct
 * - Optional repo parameter is present on tools that need it
 */
import { describe, it, expect } from 'vitest';
import { GITNEXUS_TOOLS } from '../../src/mcp/tools.js';

const GROUP_TOOLS = new Set([
  'group_list', 'group_sync',
  'unity_ui_trace',
  'rule_lab_analyze', 'rule_lab_review_pack', 'rule_lab_curate',
  'rule_lab_promote', 'rule_lab_regress',
]);
const MUTATING_TOOLS = new Set(['rename', 'group_sync']);
// Read-only tools that legitimately reach external systems. Add a tool name
// here when introducing a read-only tool that needs openWorldHint: true.
const OPEN_WORLD_READ_ONLY_TOOLS = new Set(['query']);

describe('GITNEXUS_TOOLS', () => {
  it('exports exactly 19 tools', () => {
    expect(GITNEXUS_TOOLS).toHaveLength(19);
  });

  it('contains all expected tool names', () => {
    const names = GITNEXUS_TOOLS.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'list_repos', 'query', 'cypher', 'context',
        'detect_changes', 'rename', 'impact', 'unity_ui_trace',
        'rule_lab_analyze', 'rule_lab_review_pack',
        'rule_lab_curate', 'rule_lab_promote', 'rule_lab_regress',
      ])
    );
  });

  it('each tool has name, description, and inputSchema', () => {
    for (const tool of GITNEXUS_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeTruthy();
      expect(typeof tool.description).toBe('string');
      expect(tool.annotations).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
      expect(Array.isArray(tool.inputSchema.required)).toBe(true);
    }
  });

  it('each tool exposes all MCP safety annotations', () => {
    for (const tool of GITNEXUS_TOOLS) {
      expect(typeof tool.annotations.readOnlyHint).toBe('boolean');
      expect(typeof tool.annotations.destructiveHint).toBe('boolean');
      expect(typeof tool.annotations.idempotentHint).toBe('boolean');
      expect(typeof tool.annotations.openWorldHint).toBe('boolean');
    }
  });

  it('read-only tools are marked non-destructive and idempotent', () => {
    for (const tool of GITNEXUS_TOOLS) {
      if (MUTATING_TOOLS.has(tool.name)) continue;

      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
      expect(tool.annotations.idempotentHint).toBe(true);
      expect(tool.annotations.openWorldHint).toBe(OPEN_WORLD_READ_ONLY_TOOLS.has(tool.name));
    }
  });

  it('query is marked open-world because it may use external embeddings', () => {
    const queryTool = GITNEXUS_TOOLS.find((t) => t.name === 'query')!;
    expect(queryTool.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  it('rename and group_sync are marked mutating and non-idempotent', () => {
    for (const name of ['rename', 'group_sync'] as const) {
      const tool = GITNEXUS_TOOLS.find((t) => t.name === name)!;
      expect(tool.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      });
    }
  });

  it('query tool requires "query" parameter', () => {
    const queryTool = GITNEXUS_TOOLS.find((t) => t.name === 'query')!;
    expect(queryTool.inputSchema.required).toContain('query');
    expect(queryTool.inputSchema.properties.query).toBeDefined();
    expect(queryTool.inputSchema.properties.query.type).toBe('string');
  });

  it('cypher tool requires "query" parameter', () => {
    const cypherTool = GITNEXUS_TOOLS.find((t) => t.name === 'cypher')!;
    expect(cypherTool.inputSchema.required).toContain('query');
  });

  it('context tool has no required parameters', () => {
    const contextTool = GITNEXUS_TOOLS.find((t) => t.name === 'context')!;
    expect(contextTool.inputSchema.required).toEqual([]);
  });

  it('impact tool requires target and direction', () => {
    const impactTool = GITNEXUS_TOOLS.find((t) => t.name === 'impact')!;
    expect(impactTool.inputSchema.required).toContain('target');
    expect(impactTool.inputSchema.required).toContain('direction');
  });

  it('rename tool requires new_name', () => {
    const renameTool = GITNEXUS_TOOLS.find((t) => t.name === 'rename')!;
    expect(renameTool.inputSchema.required).toContain('new_name');
  });

  it('detect_changes tool has no required parameters', () => {
    const detectTool = GITNEXUS_TOOLS.find((t) => t.name === 'detect_changes')!;
    expect(detectTool.inputSchema.required).toEqual([]);
  });

  it('list_repos tool has no parameters', () => {
    const listTool = GITNEXUS_TOOLS.find((t) => t.name === 'list_repos')!;
    expect(Object.keys(listTool.inputSchema.properties)).toHaveLength(0);
    expect(listTool.inputSchema.required).toEqual([]);
  });

  it('per-repo tools have optional repo parameter for backend selection', () => {
    for (const tool of GITNEXUS_TOOLS) {
      if (tool.name === 'list_repos') continue;
      if (GROUP_TOOLS.has(tool.name)) continue;
      expect(tool.inputSchema.properties.repo).toBeDefined();
      expect(tool.inputSchema.properties.repo.type).toBe('string');
      expect(tool.inputSchema.required).not.toContain('repo');
    }
  });

  it('group tools without backend repo param omit repo property', () => {
    for (const name of ['group_list', 'group_sync'] as const) {
      const tool = GITNEXUS_TOOLS.find((t) => t.name === name)!;
      expect(tool.inputSchema.properties).not.toHaveProperty('repo');
    }
  });

  it('impact, query, and context expose optional service with minLength', () => {
    for (const n of ['impact', 'query', 'context'] as const) {
      const tool = GITNEXUS_TOOLS.find((t) => t.name === n)!;
      const svc = tool.inputSchema.properties.service;
      expect(svc, n).toBeDefined();
      expect(svc!.minLength).toBe(1);
    }
  });

  it('impact schema bounds match cross-impact validation ranges', () => {
    const impact = GITNEXUS_TOOLS.find((t) => t.name === 'impact')!;
    expect(impact.inputSchema.properties.maxDepth.minimum).toBe(1);
    expect(impact.inputSchema.properties.maxDepth.maximum).toBe(32);
    expect(impact.inputSchema.properties.minConfidence.minimum).toBe(0);
    expect(impact.inputSchema.properties.minConfidence.maximum).toBe(1);
    expect(impact.inputSchema.properties.timeoutMs.maximum).toBe(3600000);
  });

  it('detect_changes scope has correct enum values', () => {
    const detectTool = GITNEXUS_TOOLS.find((t) => t.name === 'detect_changes')!;
    const scopeProp = detectTool.inputSchema.properties.scope;
    expect(scopeProp.enum).toEqual(['unstaged', 'staged', 'all', 'compare']);
  });

  it('api_impact tool has no required parameters', () => {
    const apiImpactTool = GITNEXUS_TOOLS.find((t) => t.name === 'api_impact')!;
    expect(apiImpactTool).toBeDefined();
    expect(apiImpactTool.inputSchema.required).toEqual([]);
    expect(apiImpactTool.inputSchema.properties.route).toBeDefined();
    expect(apiImpactTool.inputSchema.properties.file).toBeDefined();
    expect(apiImpactTool.inputSchema.properties.repo).toBeDefined();
  });

  it('impact relationTypes is array of strings', () => {
    const impactTool = GITNEXUS_TOOLS.find((t) => t.name === 'impact')!;
    const relProp = impactTool.inputSchema.properties.relationTypes;
    expect(relProp.type).toBe('array');
    expect(relProp.items).toEqual({ type: 'string' });
  });

  it('unity_ui_trace requires target and goal', () => {
    const traceTool = GITNEXUS_TOOLS.find(t => t.name === 'unity_ui_trace')!;
    expect(traceTool.inputSchema.required).toContain('target');
    expect(traceTool.inputSchema.required).toContain('goal');
  });

  it('rule_lab_analyze requires run_id and slice_id', () => {
    const tool = GITNEXUS_TOOLS.find(t => t.name === 'rule_lab_analyze')!;
    expect(tool.inputSchema.required).toContain('run_id');
    expect(tool.inputSchema.required).toContain('slice_id');
  });

  it('rule_lab_regress requires precision and coverage', () => {
    const tool = GITNEXUS_TOOLS.find(t => t.name === 'rule_lab_regress')!;
    expect(tool.inputSchema.required).toContain('precision');
    expect(tool.inputSchema.required).toContain('coverage');
  });

  it('query tool exposes phase3 evidence and hydration controls', () => {
    const query = GITNEXUS_TOOLS.find(t => t.name === 'query')!;
    expect(query.inputSchema.properties.unity_evidence_mode).toBeDefined();
    expect(query.inputSchema.properties.hydration_policy).toBeDefined();
    expect(query.inputSchema.properties.resource_path_prefix).toBeDefined();
    expect(query.inputSchema.properties.binding_kind).toBeDefined();
  });
});
