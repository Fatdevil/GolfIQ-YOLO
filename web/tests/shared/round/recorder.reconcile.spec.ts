import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { autoQueue } from '../../../../golfiq/app/src/shotsense/AutoCaptureQueue';
import {
  PostHoleReconciler,
  __setRoundRecorderForTest,
  collectAutoCandidates,
} from '../../../../golfiq/app/src/shotsense/PostHoleReconciler';

const HOLE_ID = 9;

describe('PostHoleReconciler reviewAndApply', () => {
  beforeEach(() => {
    autoQueue.finalizeHole(HOLE_ID);
    __setRoundRecorderForTest(null);
  });

  afterEach(() => {
    autoQueue.finalizeHole(HOLE_ID);
    __setRoundRecorderForTest(null);
    vi.clearAllMocks();
  });

  test('adds shots with preserved club and timestamp', async () => {
    const addShot = vi.fn().mockResolvedValue(null as any);
    __setRoundRecorderForTest({ addShot } as unknown as any);

    autoQueue.enqueue({
      ts: 1_000,
      strength: 0.8,
      holeId: HOLE_ID,
      start: { lat: 1, lon: 2 },
      lie: 'Fairway',
    });
    autoQueue.confirm({ club: '7i', playsLikePct: 5 });
    autoQueue.enqueue({
      ts: 3_000,
      strength: 0.6,
      holeId: HOLE_ID,
      start: { lat: 3, lon: 4 },
      lie: 'Rough',
    });
    autoQueue.confirm({ club: 'PW' });

    const picks = collectAutoCandidates(HOLE_ID).map((shot) => ({
      id: shot.id,
      accept: true,
      club: shot.club,
    }));
    const result = await PostHoleReconciler.reviewAndApply({ holeId: HOLE_ID, picks });

    expect(result).toEqual({ applied: 2, rejected: 0 });
    expect(addShot).toHaveBeenCalledTimes(2);
    const firstCall = addShot.mock.calls[0]![1];
    expect(firstCall.club).toBe('7i');
    expect(firstCall.start.ts).toBe(1_000);
    expect(firstCall.startLie).toBe('Fairway');
    const secondCall = addShot.mock.calls[1]![1];
    expect(secondCall.club).toBe('PW');
    expect(secondCall.start.ts).toBe(3_000);
    expect(secondCall.startLie).toBe('Rough');
  });
});
