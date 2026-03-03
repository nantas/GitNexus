import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentContextToolRunner } from './tool-runner.js';

test('agent-context tool runner exposes query/context/impact/cypher', async () => {
  const runner = await createAgentContextToolRunner();
  assert.equal(typeof runner.query, 'function');
  assert.equal(typeof runner.context, 'function');
  assert.equal(typeof runner.impact, 'function');
  assert.equal(typeof runner.cypher, 'function');
  await runner.close();
});
