import { describe, it, expect } from 'vitest';

import {
  parseHydrationPolicy,
  parseUnityEvidenceMode,
  parseUnityHydrationMode,
  parseUnityResourcesMode,
} from './options.js';

it('parseUnityResourcesMode defaults to off', () => {
  expect(parseUnityResourcesMode(undefined)).toBe('off');
});

it('parseUnityResourcesMode validates mode', () => {
  expect(parseUnityResourcesMode('on')).toBe('on');
  expect(() => parseUnityResourcesMode('bad')).toThrow(/unity resources mode/i);
});

it('parseUnityHydrationMode defaults to compact', () => {
  expect(parseUnityHydrationMode(undefined)).toBe('compact');
});

it('parseUnityHydrationMode validates mode', () => {
  expect(parseUnityHydrationMode('compact')).toBe('compact');
  expect(() => parseUnityHydrationMode('bad')).toThrow(/unity hydration mode/i);
});

it('parseUnityEvidenceMode defaults to summary and validates mode', () => {
  expect(parseUnityEvidenceMode(undefined)).toBe('summary');
  expect(parseUnityEvidenceMode('focused')).toBe('focused');
  expect(() => parseUnityEvidenceMode('bad')).toThrow(/unity evidence mode/i);
});

it('parseHydrationPolicy defaults to balanced and validates mode', () => {
  expect(parseHydrationPolicy(undefined)).toBe('balanced');
  expect(parseHydrationPolicy('strict')).toBe('strict');
  expect(() => parseHydrationPolicy('bad')).toThrow(/hydration policy/i);
});
