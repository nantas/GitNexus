import { describe, it, expect } from 'vitest';
import { buildPipelineRunOptionsForAnalyze } from '../../src/cli/analyze.js';

describe('buildPipelineRunOptionsForAnalyze', () => {
  it('passes csharp define csproj option through to pipeline', () => {
    const out = buildPipelineRunOptionsForAnalyze(
      { includeExtensions: ['.cs'], scopeRules: ['Assets/**'] },
      { csharpDefineCsproj: '/tmp/Assembly-CSharp.csproj' },
    );

    expect(out).toEqual({
      includeExtensions: ['.cs'],
      scopeRules: ['Assets/**'],
      csharpDefineCsproj: '/tmp/Assembly-CSharp.csproj',
    });
  });

  it('omits csharpDefineCsproj when undefined', () => {
    const out = buildPipelineRunOptionsForAnalyze(
      { includeExtensions: ['.cs'], scopeRules: ['Assets/**'] },
      { csharpDefineCsproj: undefined },
    );

    expect(out).toEqual({
      includeExtensions: ['.cs'],
      scopeRules: ['Assets/**'],
    });
    expect('csharpDefineCsproj' in out).toBe(false);
  });
});
