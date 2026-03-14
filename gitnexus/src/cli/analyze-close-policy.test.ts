import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldCloseKuzuOnAnalyzeExit } from './analyze-close-policy.js';

test('shouldCloseKuzuOnAnalyzeExit skips close on darwin by default', () => {
  assert.equal(shouldCloseKuzuOnAnalyzeExit('darwin', undefined), false);
});

test('shouldCloseKuzuOnAnalyzeExit closes on non-darwin platforms', () => {
  assert.equal(shouldCloseKuzuOnAnalyzeExit('linux', undefined), true);
});

test('shouldCloseKuzuOnAnalyzeExit can be force-enabled on darwin', () => {
  assert.equal(shouldCloseKuzuOnAnalyzeExit('darwin', '1'), true);
});
