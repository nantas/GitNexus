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

describe('GITNEXUS_TOOLS', () => {
  it('exports exactly 18 tools', () => {
    expect(GITNEXUS_TOOLS).toHaveLength(18);
  });

  it('contains all expected tool names', () => {
    const names = GITNEXUS_TOOLS.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'list_repos',
        'query',
        'cypher',
        'context',
        'detect_changes',
        'rename',
        'impact',
        'unity_ui_trace',
      ]),
    );
  });

  it('each tool has name, description, and inputSchema', () => {
    for (const tool of GITNEXUS_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeTruthy();
      expect(typeof tool.description).toBe('string');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
      expect(Array.isArray(tool.inputSchema.required)).toBe(true);
    }
  });

  it('query tool requires "search_query" parameter', () => {
    const queryTool = GITNEXUS_TOOLS.find((t) => t.name === 'query')!;
    expect(queryTool.inputSchema.required).toContain('search_query');
    expect(queryTool.inputSchema.properties.search_query).toBeDefined();
    expect(queryTool.inputSchema.properties.search_query.type).toBe('string');
  });

  it('cypher tool requires "statement" parameter', () => {
    const cypherTool = GITNEXUS_TOOLS.find((t) => t.name === 'cypher')!;
    expect(cypherTool.inputSchema.required).toContain('statement');
  });

  it('context tool has no required parameters', () => {
    const contextTool = GITNEXUS_TOOLS.find((t) => t.name === 'context')!;
    expect(contextTool.inputSchema.required).toEqual([]);
  });

  it('impact tool requires direction and allows uid or target', () => {
    const impactTool = GITNEXUS_TOOLS.find((t) => t.name === 'impact')!;
    expect(impactTool.inputSchema.properties.target).toBeDefined();
    expect(impactTool.inputSchema.properties.target_uid).toBeDefined();
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

  it('list_repos tool has optional pagination', () => {
    const listTool = GITNEXUS_TOOLS.find((t) => t.name === 'list_repos')!;
    expect(Object.keys(listTool.inputSchema.properties)).toEqual(['limit', 'offset']);
    expect(listTool.inputSchema.required).toEqual([]);
  });

  it('all tools except list_repos have optional repo parameter', () => {
    for (const tool of GITNEXUS_TOOLS) {
      if (['list_repos', 'group_list', 'group_sync'].includes(tool.name)) continue;
      expect(tool.inputSchema.properties.repo).toBeDefined();
      expect(tool.inputSchema.properties.repo.type).toBe('string');
      // repo should never be required
      expect(tool.inputSchema.required).not.toContain('repo');
    }
  });

  it('detect_changes scope has correct enum values', () => {
    const detectTool = GITNEXUS_TOOLS.find((t) => t.name === 'detect_changes')!;
    const scopeProp = detectTool.inputSchema.properties.scope;
    expect(scopeProp.enum).toEqual(['unstaged', 'staged', 'all', 'compare']);
  });

  it('impact relationTypes is array of strings', () => {
    const impactTool = GITNEXUS_TOOLS.find((t) => t.name === 'impact')!;
    const relProp = impactTool.inputSchema.properties.relationTypes;
    expect(relProp.type).toBe('array');
    expect(relProp.items).toEqual({ type: 'string' });
  });

  it('unity_ui_trace requires target and goal', () => {
    const traceTool = GITNEXUS_TOOLS.find((t) => t.name === 'unity_ui_trace')!;
    expect(traceTool.inputSchema.required).toContain('target');
    expect(traceTool.inputSchema.required).toContain('goal');
  });

  it('query tool exposes phase3 evidence and hydration controls', () => {
    const query = GITNEXUS_TOOLS.find((t) => t.name === 'query')!;
    expect(query.inputSchema.properties.unity_evidence_mode).toBeDefined();
    expect(query.inputSchema.properties.hydration_policy).toBeDefined();
    expect(query.inputSchema.properties.resource_path_prefix).toBeDefined();
    expect(query.inputSchema.properties.binding_kind).toBeDefined();
  });
});
