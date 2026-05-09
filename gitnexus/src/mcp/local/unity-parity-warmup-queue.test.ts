import { describe, it, expect } from 'vitest';

import { createParityWarmupQueue } from './unity-parity-warmup-queue.js';

it('runWarmupTask respects max parallel limit', async () => {
  let running = 0;
  let maxSeen = 0;
  const queue = createParityWarmupQueue({ maxParallel: 2 });

  await Promise.all(Array.from({ length: 6 }).map(() => queue.run(async () => {
    running += 1;
    maxSeen = Math.max(maxSeen, running);
    await new Promise((resolve) => setTimeout(resolve, 20));
    running -= 1;
  })));

  expect(maxSeen <= 2).toBe(true);
});
