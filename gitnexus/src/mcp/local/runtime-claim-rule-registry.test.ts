
import { describe, it, expect } from 'vitest';
import { parseRuleYaml, RuleRegistryLoadError } from './runtime-claim-rule-registry.js';

describe('parseRuleYaml', () => {
  it('parses a minimal v1 rule with required fields', () => {
    const yaml = [
      'id: demo.reload.rule.v1',
      'version: 1.2.3',
      'trigger_family: reload',
      'resource_types:',
      '  - asset',
      'host_base_type:',
      '  - ReloadBase',
      'required_hops:',
      '  - resource',
      'guarantees:',
      '  - reload_chain_closed',
      'non_guarantees:',
      '  - no_runtime_execution',
      'next_action: gitnexus query "reload"',
    ].join('\n');

    const rule = parseRuleYaml(yaml, 'demo.yaml');
    expect(rule.id).toBe('demo.reload.rule.v1');
    expect(rule.version).toBe('1.2.3');
    expect(rule.trigger_family).toBe('reload');
    expect(rule.resource_types).toEqual(['asset']);
    expect(rule.host_base_type).toEqual(['ReloadBase']);
    expect(rule.required_hops).toEqual(['resource']);
    expect(rule.guarantees).toEqual(['reload_chain_closed']);
    expect(rule.non_guarantees).toEqual(['no_runtime_execution']);
    expect(rule.next_action).toBe('gitnexus query "reload"');
    expect(rule.file_path).toBe('demo.yaml');
  });

  it('throws when id or version is missing', () => {
    expect(() => parseRuleYaml('trigger_family: x', 'missing.yaml')).toThrow(/id.*version/i);
  });

  it('parses scalar/list values with spaces, quotes, and escapes without truncation', () => {
    const yaml = [
      'id: demo.scalar-parser.v1',
      'version: 1.0.0',
      'trigger_family: reload',
      'resource_types:',
      '  - "asset ref"',
      "  - 'prefab ref'",
      'host_base_type:',
      "  - 'ReloadBase'",
      'required_hops:',
      '  - resource',
      'guarantees:',
      "  - 'guarantee with spaces'",
      'non_guarantees:',
      '  - "double-quote \\"inside\\""',
      "  - 'single-quote ''inside'''",
      'next_action: node gitnexus/dist/cli/index.js query --runtime-chain-verify on-demand "Reload NEON.Game.Graph.Nodes.Reloads"',
    ].join('\n');

    const rule = parseRuleYaml(yaml, 'scalar.yaml');
    expect(rule.id).toBe('demo.scalar-parser.v1');
    expect(rule.resource_types).toEqual(['asset ref', 'prefab ref']);
    expect(rule.guarantees).toEqual(['guarantee with spaces']);
    expect(rule.non_guarantees).toEqual(['double-quote "inside"', "single-quote 'inside'"]);
    expect(rule.next_action).toBe('node gitnexus/dist/cli/index.js query --runtime-chain-verify on-demand "Reload NEON.Game.Graph.Nodes.Reloads"');
  });

  it('rejects v2 rule yaml when topology/closure/claims are missing', () => {
    const yaml = [
      'id: demo.reload.rule.v2',
      'version: 2.0.0',
      'trigger_family: reload',
      'resource_types:',
      '  - asset',
      'host_base_type:',
      '  - ReloadBase',
      'required_hops:',
      '  - resource',
      'guarantees:',
      '  - reload_chain_closed',
      'non_guarantees:',
      '  - no_runtime_execution_guarantee',
    ].join('\n');

    expect(() => parseRuleYaml(yaml, 'v2-incomplete.yaml')).toThrow(/topology|closure|claims/i);
  });

  it('parses v2 rule with match, topology, closure, and claims sections', () => {
    const yaml = [
      'id: demo.v2.rule',
      'version: 2.0.0',
      'match:',
      '  trigger_tokens:',
      '    - reload',
      '  symbol_kind:',
      '    - Method',
      'topology:',
      '  - hop: resource',
      '    from: { entity: resource }',
      '    to: { entity: script }',
      '    edge: { kind: binds_script }',
      'closure:',
      '  required_hops:',
      '    - resource',
      '    - code_runtime',
      'claims:',
      '  guarantees:',
      '    - reload_chain_closed',
      '  non_guarantees:',
      '    - no_runtime_execution',
      '  next_action: gitnexus query "reload"',
    ].join('\n');

    const rule = parseRuleYaml(yaml, 'v2.yaml');
    expect(rule.id).toBe('demo.v2.rule');
    expect(rule.match?.trigger_tokens).toEqual(['reload']);
    expect(rule.match?.symbol_kind).toEqual(['Method']);
    expect(rule.required_hops).toEqual(['resource', 'code_runtime']);
    expect(rule.guarantees).toEqual(['reload_chain_closed']);
    expect(rule.non_guarantees).toEqual(['no_runtime_execution']);
    expect(rule.next_action).toBe('gitnexus query "reload"');
  });

  it('parses resource_bindings with kind and optional fields', () => {
    const yaml = [
      'id: demo.bindings',
      'version: 1.0.0',
      'resource_bindings:',
      '  - kind: asset_ref_loads_components',
      '    ref_field_pattern: "m_[vV]ar"',
      '    target_entry_points:',
      '      - Awake',
      '      - Start',
    ].join('\n');

    const rule = parseRuleYaml(yaml, 'bindings.yaml');
    expect(rule.resource_bindings).toHaveLength(1);
    expect(rule.resource_bindings![0].kind).toBe('asset_ref_loads_components');
    expect(rule.resource_bindings![0].ref_field_pattern).toBe('m_[vV]ar');
    expect(rule.resource_bindings![0].target_entry_points).toEqual(['Awake', 'Start']);
  });

  it('parses lifecycle_overrides section', () => {
    const yaml = [
      'id: demo.lifecycle',
      'version: 1.0.0',
      'lifecycle_overrides:',
      '  additional_entry_points:',
      '    - CustomAwake',
      '  scope: global',
    ].join('\n');

    const rule = parseRuleYaml(yaml, 'lifecycle.yaml');
    expect(rule.lifecycle_overrides).toBeDefined();
    expect(rule.lifecycle_overrides!.additional_entry_points).toEqual(['CustomAwake']);
    expect(rule.lifecycle_overrides!.scope).toBe('global');
  });
});

it('RuleRegistryLoadError carries code and details', () => {
  const err = new RuleRegistryLoadError('rule_catalog_missing', 'not found', { path: '/foo' });
  expect(err).toBeInstanceOf(RuleRegistryLoadError);
  expect(err.code).toBe('rule_catalog_missing');
  expect(err.details).toEqual({ path: '/foo' });
});
