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

test('dedupes by shot timestamp, not wall clock', () => {
  const queue = new AutoCaptureQueue();
  const events: string[] = [];

  queue.on((event) => {
    if (event.type === 'enqueue') {
      events.push('enqueue');
    }
  });

  const firstTs = 1_000_000;
  const secondTs = firstTs + 2000;

  queue.enqueue({ ts: firstTs, strength: 0.8, holeId: 1 });
  queue.enqueue({ ts: secondTs, strength: 0.9, holeId: 1 });

  expect(events).toHaveLength(2);
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

test('prefill applies club on confirm when no club provided', () => {
  const queue = new AutoCaptureQueue();
  const handle = queue.prefillClub(' 7i ');
  expect(handle?.club).toBe('7i');
  queue.enqueue({ ts: 1_000, strength: 0.8, holeId: 3 });
  queue.confirm();
  const accepted = queue.getAcceptedShots(3);
  expect(accepted).toHaveLength(1);
  expect(accepted[0]?.club).toBe('7i');
});

test('clearing prefill prevents fallback', () => {
  const queue = new AutoCaptureQueue();
  const handle = queue.prefillClub('8i');
  expect(handle).not.toBeNull();
  queue.clearPrefill(handle!.token);
  queue.enqueue({ ts: 2_000, strength: 0.7, holeId: 5 });
  queue.confirm();
  const accepted = queue.getAcceptedShots(5);
  expect(accepted[0]?.club).toBeUndefined();
});

test('latest prefill wins for subsequent shots', () => {
  const queue = new AutoCaptureQueue();
  queue.prefillClub('6i');
  const latest = queue.prefillClub('9i');
  queue.enqueue({ ts: 3_000, strength: 0.6, holeId: 7 });
  queue.confirm();
  const accepted = queue.getAcceptedShots(7);
  expect(accepted[0]?.club).toBe('9i');
  expect(latest?.token).toBeDefined();
});
