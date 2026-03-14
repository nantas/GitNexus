import { constants as osConstants } from 'node:os';

export interface ChildExitResolution {
  code: number;
  signal?: string;
  bySignal: boolean;
}

/**
 * Convert a signal name to a conventional shell exit code (128 + signal number).
 */
export function getSignalExitCode(signal?: string | null): number | null {
  if (!signal) return null;
  const signalNumber = (osConstants.signals as Record<string, number | undefined>)[signal];
  if (typeof signalNumber !== 'number') return null;
  return 128 + signalNumber;
}

/**
 * Normalize child-process termination details into a stable numeric exit code.
 */
export function resolveChildProcessExit(error: any, fallbackCode = 1): ChildExitResolution {
  if (typeof error?.status === 'number') {
    return { code: error.status, bySignal: false };
  }

  if (typeof error?.signal === 'string') {
    const code = getSignalExitCode(error.signal) ?? fallbackCode;
    return { code, signal: error.signal, bySignal: true };
  }

  return { code: fallbackCode, bySignal: false };
}
