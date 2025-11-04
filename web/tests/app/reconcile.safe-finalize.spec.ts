import { afterEach, describe, expect, test, vi } from 'vitest';

import { autoQueue } from '../../../golfiq/app/src/shotsense/AutoCaptureQueue';
import {
  PostHoleReconciler,
  __setRoundRecorderForTest,
} from '../../../golfiq/app/src/shotsense/PostHoleReconciler';

const FAILURE_HOLE_ID = 11;
const SUCCESS_HOLE_ID = 12;

type Candidate = {
  id: string;
  holeId: number;
  ts: number;
  start: { lat: number; lon: number; ts: number };
  club?: string;
  lie?: 'Fairway' | 'Rough' | 'Sand' | 'Tee' | 'Recovery';
  playsLikePct?: number;
  source: 'auto';
};

function makeCandidate(holeId: number, id: string, ts: number, club: string): Candidate {
  return {
    id,
    holeId,
    ts,
    start: { lat: 35 + ts / 10_000, lon: -120 + ts / 10_000, ts },
    club,
    lie: 'Fairway',
    source: 'auto',
  };
}

describe('PostHoleReconciler safe finalize semantics', () => {
  afterEach(() => {
    delete (autoQueue as typeof autoQueue & { getPendingShots?: (holeId: number) => Candidate[] })
      .getPendingShots;
    __setRoundRecorderForTest(null);
    vi.restoreAllMocks();
  });

  test('failure keeps pending shots and skips finalizeHole', async () => {
    const candidate = makeCandidate(FAILURE_HOLE_ID, 'shot-fail', 1_000, '7i');
    vi.spyOn(autoQueue, 'getAcceptedShots').mockReturnValue([candidate]);
    const queueWithPending = autoQueue as typeof autoQueue & {
      getPendingShots?: (holeId: number) => Candidate[];
    };
    const pendingSpy = vi.fn<(holeId: number) => Candidate[]>().mockReturnValue([candidate]);
    queueWithPending.getPendingShots = pendingSpy;

    const finalizeShotSpy = vi.spyOn(autoQueue, 'finalizeShot');
    const finalizeHoleSpy = vi.spyOn(autoQueue, 'finalizeHole').mockImplementation(() => undefined as any);

    const addShot = vi.fn().mockRejectedValue(new Error('nope'));
    __setRoundRecorderForTest({ addShot } as unknown as any);

    const result = await PostHoleReconciler.reviewAndApply({ holeId: FAILURE_HOLE_ID });

    expect(result).toEqual({ applied: 0, rejected: 1 });
    expect(finalizeShotSpy).not.toHaveBeenCalled();
    expect(finalizeHoleSpy).not.toHaveBeenCalled();
    expect(pendingSpy).toHaveBeenCalledWith(FAILURE_HOLE_ID);
  });

  test('all resolved shots finalize hole once', async () => {
    const first = makeCandidate(SUCCESS_HOLE_ID, 'shot-1', 1_000, '8i');
    const second = makeCandidate(SUCCESS_HOLE_ID, 'shot-2', 3_000, 'PW');
    vi.spyOn(autoQueue, 'getAcceptedShots').mockReturnValue([first, second]);

    const finalizeShotSpy = vi.spyOn(autoQueue, 'finalizeShot');
    const finalizeHoleSpy = vi.spyOn(autoQueue, 'finalizeHole').mockImplementation(() => undefined as any);

    const addShot = vi.fn().mockResolvedValue(undefined);
    __setRoundRecorderForTest({ addShot } as unknown as any);

    const result = await PostHoleReconciler.reviewAndApply({ holeId: SUCCESS_HOLE_ID });

    expect(result).toEqual({ applied: 2, rejected: 0 });
    expect(addShot).toHaveBeenCalledTimes(2);
    expect(finalizeShotSpy).toHaveBeenCalledTimes(2);
    expect(new Set(finalizeShotSpy.mock.calls.map((call) => call[1]))).toEqual(
      new Set([first.id, second.id]),
    );
    expect(finalizeHoleSpy).toHaveBeenCalledTimes(1);
  });
});
