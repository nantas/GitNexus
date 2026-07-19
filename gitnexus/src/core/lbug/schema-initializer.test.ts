import test from 'node:test';
import assert from 'node:assert/strict';
import { createSchemaOrThrow } from './schema-initializer.js';

test('schema initializer ignores only already-exists errors', async () => {
  const seen: string[] = [];
  await createSchemaOrThrow(['CREATE A', 'CREATE B'], async (query) => {
    seen.push(query);
    if (query === 'CREATE A') throw new Error('Table already exists');
  });
  assert.deepEqual(seen, ['CREATE A', 'CREATE B']);
});

test('schema initializer rejects LadybugDB lock errors', async () => {
  await assert.rejects(
    createSchemaOrThrow(['CREATE A'], async () => {
      throw new Error('IO exception: Could not set lock on file');
    }),
    /schema creation failed.*Could not set lock/i,
  );
});
