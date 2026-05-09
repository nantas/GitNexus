import { describe, it, expect } from 'vitest'

import {
  formatFallbackSummary,
  formatUnityDiagnosticsSummary,
  formatUnityRuleBindingSummary,
  resolveFallbackStats,
} from './analyze-summary.js';

it('formatUnityDiagnosticsSummary returns empty when diagnostics are missing', () => {
  const lines = formatUnityDiagnosticsSummary([]);
  expect(lines).toEqual([]);
});

it('formatUnityDiagnosticsSummary renders diagnostics with count and bullets', () => {
  const lines = formatUnityDiagnosticsSummary([
    'scanContext: scripts=4, guids=4, resources=0',
  ]);

  expect(lines).toEqual([
    'Unity Diagnostics: 1 message(s)',
    '- scanContext: scripts=4, guids=4, resources=0',
  ]);
});

it('formatUnityDiagnosticsSummary truncates output after max preview items', () => {
  const lines = formatUnityDiagnosticsSummary([
    'diag-a',
    'diag-b',
    'diag-c',
    'diag-d',
  ]);

  expect(lines).toEqual([
    'Unity Diagnostics: 4 message(s)',
    '- diag-a',
    '- diag-b',
    '- diag-c',
    '... 1 more',
  ]);
});

it('formatUnityRuleBindingSummary renders diagnostics and agent report status', () => {
  const lines = formatUnityRuleBindingSummary({
    edgesInjected: 3,
    ruleResults: [{ ruleId: 'unity.global-init', edgesInjected: 3 }],
    diagnostics: {
      rulesEvaluated: 1,
      bindingsEvaluated: 1,
      bindingsByKind: { method_triggers_scene_load: 1 },
      methodLookupCalls: 5,
      methodLookupCacheHits: 4,
      sceneRuntimeTraversalCalls: 3,
      sceneRuntimeTraversalCacheHits: 2,
      sceneRuntimeResourcesVisited: 6,
      anomalies: [],
      shouldAgentReport: false,
      agentReportReason: 'no anomalies detected',
      summary: [
        'rule_binding.summary: rules=1, bindings=1, edges=3',
        'rule_binding.lookup: method_calls=5, cache_hits=4',
        'rule_binding.agent_report: should_report=false reason="no anomalies detected"',
      ],
    },
  } as any);

  expect(lines).toEqual([
    'Unity Rule Binding Diagnostics:',
    '- rule_binding.summary: rules=1, bindings=1, edges=3',
    '- rule_binding.lookup: method_calls=5, cache_hits=4',
    '- rule_binding.agent_report: should_report=false reason="no anomalies detected"',
  ]);
});

it('formatUnityRuleBindingSummary renders anomaly preview', () => {
  const lines = formatUnityRuleBindingSummary({
    edgesInjected: 0,
    ruleResults: [],
    diagnostics: {
      rulesEvaluated: 1,
      bindingsEvaluated: 1,
      bindingsByKind: { method_triggers_scene_load: 1 },
      methodLookupCalls: 0,
      methodLookupCacheHits: 0,
      sceneRuntimeTraversalCalls: 0,
      sceneRuntimeTraversalCacheHits: 0,
      sceneRuntimeResourcesVisited: 0,
      anomalies: [
        'rule=unity.global-init: scene "Global" not found in File(.unity) index',
        'rule=unity.global-init: method_triggers_scene_load missing host_class_pattern, loader_methods, or scene_name',
      ],
      shouldAgentReport: true,
      agentReportReason: 'rule-binding anomalies detected',
      summary: [
        'rule_binding.summary: rules=1, bindings=1, edges=0',
        'rule_binding.agent_report: should_report=true reason="rule-binding anomalies detected"',
      ],
    },
  } as any, 1);

  expect(lines).toEqual([
    'Unity Rule Binding Diagnostics:',
    '- rule_binding.summary: rules=1, bindings=1, edges=0',
    '- rule_binding.agent_report: should_report=true reason="rule-binding anomalies detected"',
    '- rule_binding.anomalies: count=2',
    '- rule_binding.anomaly: rule=unity.global-init: scene "Global" not found in File(.unity) index',
    '- rule_binding.anomaly: ... 1 more',
  ]);
});

it('formatFallbackSummary returns empty when no warnings exist', () => {
  const lines = formatFallbackSummary([], {
    attempted: 0,
    succeeded: 0,
    failed: 0,
  });
  expect(lines).toEqual([]);
});

it('formatFallbackSummary renders attempted/succeeded/failed with warning preview', () => {
  const lines = formatFallbackSummary(
    [
      'Method->Delegate (1233 edges): missing rel pair in schema',
      'Class->Property (200 edges): missing rel pair in schema',
      'Constructor->Property (97 edges): missing rel pair in schema',
      'Function->Property (17 edges): missing rel pair in schema',
    ],
    {
      attempted: 1547,
      succeeded: 0,
      failed: 1547,
    },
    3,
  );

  expect(lines).toEqual([
    'Fallback edges: attempted=1547, succeeded=0, failed=1547, pairTypes=4',
    '- Method->Delegate (1233 edges): missing rel pair in schema',
    '- Class->Property (200 edges): missing rel pair in schema',
    '- Constructor->Property (97 edges): missing rel pair in schema',
    '... 1 more',
  ]);
});

it('resolveFallbackStats prefers runtime fallback insert stats when available', () => {
  expect(resolveFallbackStats(
      ['Class->File (12 edges): missing rel pair in schema'],
      { attempted: 12, succeeded: 3, failed: 9 },
    )).toEqual({ attempted: 12, succeeded: 3, failed: 9 },);
});

it('resolveFallbackStats derives attempted/failed from warnings when runtime stats are missing', () => {
  expect(resolveFallbackStats(['Class->File (7 edges): missing rel pair in schema'], undefined)).toEqual({ attempted: 7, succeeded: 0, failed: 7 },);
});
