import { describe, it, expect } from 'vitest'

import { unityUiTraceCommand } from './tool.js';

it('unity-ui-trace command forwards params and prints result', async () => {
  const calls: Array<{ method: string; params: any }> = [];
  let printed: any = null;

  await unityUiTraceCommand(
    'EliteBossScreenController',
    { goal: 'selector_bindings', selectorMode: 'strict', repo: 'mini-unity-ui' },
    {
      backend: {
        async callTool(method: string, params: any) {
          calls.push({ method, params });
          return { goal: 'selector_bindings', results: [{ evidence_chain: [{ path: 'a', line: 1 }] }], diagnostics: [] };
        },
      },
      output: (value: any) => {
        printed = value;
      },
    },
  );

  expect(calls.length).toBe(1);
  expect(calls[0].method).toBe('unity_ui_trace');
  expect(calls[0].params.target).toBe('EliteBossScreenController');
  expect(calls[0].params.goal).toBe('selector_bindings');
  expect(calls[0].params.selector_mode).toBe('strict');
  expect(printed.goal).toBe('selector_bindings');
});
