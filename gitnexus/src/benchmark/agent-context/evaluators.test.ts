import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCheckE, evaluateCheckT } from './evaluators.js';

test('evaluates mandatory target disambiguation check T', () => {
  const stepOutputs = [
    {
      symbol: { uid: 'Class:Sample:Target' },
      target: { id: 'Class:Sample:Target' },
      process_symbols: [{ id: 'Class:Sample:Target', name: 'Target' }],
      definitions: [],
    },
  ];

  const result = evaluateCheckT(stepOutputs, 'Class:Sample:Target');
  assert.equal(result.pass, true);
});

test('evaluates efficiency check E by tool call budget', () => {
  const result = evaluateCheckE(3, 4);
  assert.equal(result.pass, true);
});
