import { describe, it, expect } from 'vitest';
import { formatDiagnosticsSummary } from '../../src/cli/analyze-diagnostics.js';
import type { CSharpPreprocDiagnostics } from '../../src/types/pipeline.js';
import type { UnityRuntimeBindingResult } from '../../src/core/ingestion/unity-runtime-binding-rules.js';

describe('formatDiagnosticsSummary', () => {
  it('returns empty array for undefined context', () => {
    expect(formatDiagnosticsSummary(undefined)).toEqual([]);
  });

  it('returns empty array for empty context', () => {
    expect(formatDiagnosticsSummary({})).toEqual([]);
  });

  it('formats C# preproc diagnostics', () => {
    const csharpPreproc: CSharpPreprocDiagnostics = {
      enabled: true,
      sourcePath: '/repo/Assembly-CSharp.csproj',
      defineSymbolCount: 5,
      normalizedFiles: 10,
      fallbackFiles: 2,
      skippedFiles: 1,
      expressionErrors: 0,
      undefinedSymbols: ['SYMBOL_A', 'SYMBOL_B'],
    };
    const lines = formatDiagnosticsSummary({ csharpPreproc });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain('CSharp Preproc:');
    expect(lines.some((l) => l.includes('Assembly-CSharp.csproj'))).toBe(true);
  });

  it('formats Unity rule binding diagnostics', () => {
    const unityBinding: UnityRuntimeBindingResult = {
      edgesInjected: 3,
      ruleResults: [],
      diagnostics: {
        rulesEvaluated: 2,
        bindingsEvaluated: 4,
        bindingsByKind: { asset_ref_loads_components: 2 },
        methodLookupCalls: 10,
        methodLookupCacheHits: 5,
        sceneRuntimeTraversalCalls: 0,
        sceneRuntimeTraversalCacheHits: 0,
        sceneRuntimeResourcesVisited: 0,
        anomalies: ['anomaly-1'],
        shouldAgentReport: true,
        agentReportReason: 'anomaly detected',
        summary: ['rule_binding.summary: rules=2'],
      },
    };
    const lines = formatDiagnosticsSummary({ unityBinding });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes('Unity Rule Binding Diagnostics:'))).toBe(true);
  });

  it('combines multiple diagnostic sources', () => {
    const csharpPreproc: CSharpPreprocDiagnostics = {
      enabled: true,
      sourcePath: '/repo/csproj',
      defineSymbolCount: 1,
      normalizedFiles: 1,
      fallbackFiles: 0,
      skippedFiles: 0,
      expressionErrors: 0,
      undefinedSymbols: [],
    };
    const unityBinding: UnityRuntimeBindingResult = {
      edgesInjected: 0,
      ruleResults: [],
      diagnostics: {
        rulesEvaluated: 0,
        bindingsEvaluated: 0,
        bindingsByKind: {},
        methodLookupCalls: 0,
        methodLookupCacheHits: 0,
        sceneRuntimeTraversalCalls: 0,
        sceneRuntimeTraversalCacheHits: 0,
        sceneRuntimeResourcesVisited: 0,
        anomalies: [],
        shouldAgentReport: false,
        agentReportReason: 'no anomalies',
        summary: ['rule_binding.summary: rules=0, bindings=0, edges=0'],
      },
    };
    const lines = formatDiagnosticsSummary({ csharpPreproc, unityBinding });
    expect(lines.some((l) => l.includes('CSharp Preproc:'))).toBe(true);
    expect(lines.some((l) => l.includes('Unity Rule Binding Diagnostics:'))).toBe(true);
  });

  it('returns empty array when all sources are absent or disabled', () => {
    const lines = formatDiagnosticsSummary({
      csharpPreproc: {
        enabled: false,
        defineSymbolCount: 0,
        normalizedFiles: 0,
        fallbackFiles: 0,
        skippedFiles: 0,
        expressionErrors: 0,
        undefinedSymbols: [],
      },
      unityBinding: {
        edgesInjected: 0,
        ruleResults: [],
        diagnostics: {
          rulesEvaluated: 0,
          bindingsEvaluated: 0,
          bindingsByKind: {},
          methodLookupCalls: 0,
          methodLookupCacheHits: 0,
          sceneRuntimeTraversalCalls: 0,
          sceneRuntimeTraversalCacheHits: 0,
          sceneRuntimeResourcesVisited: 0,
          anomalies: [],
          shouldAgentReport: false,
          agentReportReason: '',
          summary: [],
        },
      },
    });
    expect(lines).toEqual([]);
  });
});
