import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PostScoreArgs, PostScoreResult } from '@app/api/events';
import { createScoreQueue } from '@app/hooks/useScoreQueue';

type TelemetryEvent = { event: string; payload: Record<string, unknown> };

function createHarness(initialNow = 1000) {
  const events: TelemetryEvent[] = [];
  let currentNow = initialNow;
  const postScoreMock = vi.fn<[PostScoreArgs], Promise<PostScoreResult>>();
  const queue = createScoreQueue({
    postScore: postScoreMock,
    now: () => currentNow,
    random: () => 0,
    emit: (event, payload) => {
      events.push({ event, payload });
    },
  });
  return {
    queue,
    events,
    setNow(value: number) {
      currentNow = value;
    },
    getNow() {
      return currentNow;
    },
    postScore: postScoreMock,
  };
}

describe('score queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes successful posts from the queue', async () => {
    const harness = createHarness(1500);
    harness.postScore.mockResolvedValue({ ok: true, revision: 2 });

    harness.queue.enqueue({
      eventId: 'evt-1',
      scorecardId: 'card-1',
      hole: 3,
      strokes: 4,
      revision: 1,
    });

    const flushed = await harness.queue.flush(harness.getNow());

    expect(flushed).toBe(1);
    expect(harness.queue.size()).toBe(0);
    expect(harness.events).toContainEqual({ event: 'mobile.score.flushed', payload: { count: 1, idempotent: false } });
  });

  it('treats idempotent successes as flushed', async () => {
    const harness = createHarness(900);
    harness.postScore.mockResolvedValue({ ok: true, idempotent: true, revision: 5 });

    harness.queue.enqueue({
      eventId: 'evt-2',
      scorecardId: 'card-2',
      hole: 5,
      strokes: 3,
      revision: 4,
    });

    const flushed = await harness.queue.flush(harness.getNow());

    expect(flushed).toBe(1);
    expect(harness.queue.size()).toBe(0);
    expect(harness.events).toContainEqual({ event: 'mobile.score.flushed', payload: { count: 1, idempotent: true } });
  });

  it('bumps revision and fingerprint on 409 conflicts then succeeds', async () => {
    const harness = createHarness(700);
    const firstCallArgs: PostScoreArgs[] = [];
    harness.postScore.mockImplementationOnce(async (args: PostScoreArgs) => {
      firstCallArgs.push(args);
      return {
        ok: false,
        retry: 'bump',
        currentRevision: 2,
        reason: 'STALE_OR_DUPLICATE',
        status: 409,
      } satisfies PostScoreResult;
    });
    let retryArgs: PostScoreArgs | null = null;
    harness.postScore.mockImplementationOnce(async (args: PostScoreArgs) => {
      retryArgs = args;
      return { ok: true, revision: args.revision ?? 0 } satisfies PostScoreResult;
    });

    harness.queue.enqueue({
      eventId: 'evt-3',
      scorecardId: 'card-3',
      hole: 7,
      strokes: 5,
      revision: 2,
    });

    const flushed = await harness.queue.flush(harness.getNow());

    expect(flushed).toBe(1);
    expect(harness.queue.size()).toBe(0);
    expect(firstCallArgs).toHaveLength(1);
    if (!retryArgs) {
      throw new Error('retry args missing');
    }
    const resolvedRetryArgs = retryArgs as PostScoreArgs;
    expect(resolvedRetryArgs.revision).toBe(3);
    expect(resolvedRetryArgs.fingerprint).not.toBe(firstCallArgs[0].fingerprint);
    expect(harness.events).toContainEqual({ event: 'mobile.score.retry_bumped', payload: { prevRev: 2, newRev: 3 } });
    expect(harness.events).toContainEqual({ event: 'mobile.score.flushed', payload: { count: 1, idempotent: false } });
  });

  it('marks entries stuck when 409 retry fails', async () => {
    const harness = createHarness(1100);
    harness.postScore.mockImplementationOnce(async () => ({
      ok: false,
      retry: 'bump',
      currentRevision: 4,
      reason: 'STALE_OR_DUPLICATE',
      status: 409,
    }));
    harness.postScore.mockImplementationOnce(async () => ({ ok: false, status: 409 }));

    const item = harness.queue.enqueue({
      eventId: 'evt-4',
      scorecardId: 'card-4',
      hole: 9,
      strokes: 6,
      revision: 4,
    });

    const flushed = await harness.queue.flush(harness.getNow());

    expect(flushed).toBe(0);
    const [stored] = harness.queue.getItems();
    expect(stored?.stuck).toBe(true);
    expect(stored?.attempts).toBe(1);
    expect(harness.events).toContainEqual({ event: 'mobile.score.retry_bumped', payload: { prevRev: 4, newRev: 5 } });
    expect(harness.events).toContainEqual({ event: 'mobile.score.conflict_unresolved', payload: { hole: 9, revTried: 5 } });
    expect(item.fingerprint).not.toBeUndefined();
  });

  it('applies exponential backoff for transient failures', async () => {
    const harness = createHarness(2000);
    harness.postScore.mockRejectedValue(new Error('network'));

    harness.queue.enqueue({
      eventId: 'evt-5',
      scorecardId: 'card-5',
      hole: 2,
      strokes: 4,
      revision: 1,
    });

    const flushed = await harness.queue.flush(harness.getNow());

    expect(flushed).toBe(0);
    const [stored] = harness.queue.getItems();
    expect(stored?.attempts).toBe(1);
    expect(stored?.stuck).toBeUndefined();
    expect(stored?.nextAt).toBe(2100);
  });
});
