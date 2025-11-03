import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { AutoCaptureQueue } from '../AutoCaptureQueue';

let originalDev: unknown;

beforeEach(() => {
  originalDev = (globalThis as any).__DEV__;
  (globalThis as any).__DEV__ = false;
});

afterEach(() => {
  vi.useRealTimers();
  if (originalDev === undefined) {
    delete (globalThis as any).__DEV__;
  } else {
    (globalThis as any).__DEV__ = originalDev;
  }
});

test('dedupe & ttl', async () => {
  vi.useFakeTimers();
  const queue = new AutoCaptureQueue();
  let enqueued = 0;
  let cleared = 0;

  queue.on((event) => {
    if (event.type === 'enqueue') {
      enqueued += 1;
    }
    if (event.type === 'clear') {
      cleared += 1;
    }
  });

  queue.enqueue({ ts: 1, strength: 0.8, holeId: 1 });
  queue.enqueue({ ts: 2, strength: 0.9, holeId: 1 });

  expect(enqueued).toBe(1);

  await vi.advanceTimersByTimeAsync(16_000);

  expect(cleared).toBe(1);
});
