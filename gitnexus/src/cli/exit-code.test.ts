import test from 'node:test';
import assert from 'node:assert/strict';
import { constants as osConstants } from 'node:os';
import { getSignalExitCode, resolveChildProcessExit } from './exit-code.js';

test('getSignalExitCode maps signal number using 128+N convention', () => {
  const signalNumber = (osConstants.signals as Record<string, number | undefined>).SIGSEGV;
  const expected = typeof signalNumber === 'number' ? 128 + signalNumber : null;
  assert.equal(getSignalExitCode('SIGSEGV'), expected);
});

test('resolveChildProcessExit prefers explicit status when present', () => {
  const resolved = resolveChildProcessExit({ status: 42, signal: 'SIGSEGV' }, 1);
  assert.equal(resolved.code, 42);
  assert.equal(resolved.bySignal, false);
  assert.equal(resolved.signal, undefined);
});

test('resolveChildProcessExit maps signal-based termination', () => {
  const signalNumber = (osConstants.signals as Record<string, number | undefined>).SIGSEGV;
  const expected = typeof signalNumber === 'number' ? 128 + signalNumber : 1;
  const resolved = resolveChildProcessExit({ signal: 'SIGSEGV' }, 1);
  assert.equal(resolved.code, expected);
  assert.equal(resolved.bySignal, true);
  assert.equal(resolved.signal, 'SIGSEGV');
});

test('resolveChildProcessExit falls back to default code for unknown errors', () => {
  const resolved = resolveChildProcessExit({ message: 'boom' }, 7);
  assert.equal(resolved.code, 7);
  assert.equal(resolved.bySignal, false);
});
