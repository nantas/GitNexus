import { describe, it, expect } from 'vitest'

import { constants as osConstants } from 'node:os';
import { getSignalExitCode, resolveChildProcessExit } from './exit-code.js';

it('getSignalExitCode maps signal number using 128+N convention', () => {
  const signalNumber = (osConstants.signals as Record<string, number | undefined>).SIGSEGV;
  const expected = typeof signalNumber === 'number' ? 128 + signalNumber : null;
  expect(getSignalExitCode('SIGSEGV')).toBe(expected);
});

it('resolveChildProcessExit prefers explicit status when present', () => {
  const resolved = resolveChildProcessExit({ status: 42, signal: 'SIGSEGV' }, 1);
  expect(resolved.code).toBe(42);
  expect(resolved.bySignal).toBe(false);
  expect(resolved.signal).toBe(undefined);
});

it('resolveChildProcessExit maps signal-based termination', () => {
  const signalNumber = (osConstants.signals as Record<string, number | undefined>).SIGSEGV;
  const expected = typeof signalNumber === 'number' ? 128 + signalNumber : 1;
  const resolved = resolveChildProcessExit({ signal: 'SIGSEGV' }, 1);
  expect(resolved.code).toBe(expected);
  expect(resolved.bySignal).toBe(true);
  expect(resolved.signal).toBe('SIGSEGV');
});

it('resolveChildProcessExit falls back to default code for unknown errors', () => {
  const resolved = resolveChildProcessExit({ message: 'boom' }, 7);
  expect(resolved.code).toBe(7);
  expect(resolved.bySignal).toBe(false);
});
