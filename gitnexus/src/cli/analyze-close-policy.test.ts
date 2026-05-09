import { describe, it, expect } from 'vitest'

import { shouldCloseKuzuOnAnalyzeExit } from './analyze-close-policy.js';

it('shouldCloseKuzuOnAnalyzeExit skips close on darwin by default', () => {
  expect(shouldCloseKuzuOnAnalyzeExit('darwin', undefined)).toBe(false);
});

it('shouldCloseKuzuOnAnalyzeExit closes on non-darwin platforms', () => {
  expect(shouldCloseKuzuOnAnalyzeExit('linux', undefined)).toBe(true);
});

it('shouldCloseKuzuOnAnalyzeExit can be force-enabled on darwin', () => {
  expect(shouldCloseKuzuOnAnalyzeExit('darwin', '1')).toBe(true);
});
