import { describe, it, expect } from 'vitest'

import { createAgentContextToolRunner } from './tool-runner.js';

it('agent-context tool runner exposes query/context/impact/cypher', async () => {
  const runner = await createAgentContextToolRunner();
  expect(typeof runner.query).toBe('function');
  expect(typeof runner.context).toBe('function');
  expect(typeof runner.impact).toBe('function');
  expect(typeof runner.cypher).toBe('function');
  await runner.close();
});
