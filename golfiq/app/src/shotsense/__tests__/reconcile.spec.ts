import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { PostHoleReconciler, __setRoundRecorderForTest, collectAutoCandidates } from '../PostHoleReconciler';
import { autoQueue } from '../AutoCaptureQueue';

const HOLE_ID = 5;

beforeEach(() => {
  autoQueue.finalizeHole(HOLE_ID);
  __setRoundRecorderForTest(null);
});

afterEach(() => {
  autoQueue.finalizeHole(HOLE_ID);
  __setRoundRecorderForTest(null);
  vi.clearAllMocks();
});

test('collectAutoCandidates clones queue entries', () => {
  autoQueue.enqueue({ ts: 1_000, strength: 0.8, holeId: HOLE_ID, start: { lat: 1, lon: 2 }, lie: 'Fairway' });
  autoQueue.confirm({ club: '7i' });
  const candidates = collectAutoCandidates(HOLE_ID);
  expect(candidates).toHaveLength(1);
  expect(candidates[0]?.holeId).toBe(HOLE_ID);
  expect(candidates[0]?.start).toEqual({ lat: 1, lon: 2, ts: 1_000 });
});

test('applies accepted picks with sanitized clubs', async () => {
  const addShot = vi.fn().mockResolvedValue(null as any);
  __setRoundRecorderForTest({ addShot } as unknown as any);

  autoQueue.enqueue({ ts: 1_000, strength: 0.8, holeId: HOLE_ID, start: { lat: 1, lon: 2 }, lie: 'Fairway' });
  autoQueue.confirm({ club: '7i' });
  autoQueue.enqueue({ ts: 3_500, strength: 0.7, holeId: HOLE_ID, start: { lat: 1.1, lon: 2.1 }, lie: 'Rough' });
  autoQueue.confirm({ club: 'PW' });

  const picks = collectAutoCandidates(HOLE_ID).map((shot) => ({
    id: shot.id,
    accept: true,
    club: shot.club ?? undefined,
  }));
  const result = await PostHoleReconciler.reviewAndApply({ holeId: HOLE_ID, picks });

  expect(addShot).toHaveBeenCalledTimes(2);
  expect(addShot).toHaveBeenNthCalledWith(
    1,
    HOLE_ID,
    expect.objectContaining({
      start: expect.objectContaining({ ts: 1_000 }),
      club: '7i',
    }),
  );
  expect(result).toEqual({ applied: 2, rejected: 0 });
  expect(collectAutoCandidates(HOLE_ID)).toHaveLength(0);
  addShot.mockReset();
});

test('respects pick accept flags and rejects missing starts', async () => {
  const addShot = vi.fn().mockResolvedValue(null as any);
  __setRoundRecorderForTest({ addShot } as unknown as any);

  autoQueue.enqueue({ ts: 1_000, strength: 0.8, holeId: HOLE_ID, start: { lat: 1, lon: 2 }, lie: 'Fairway' });
  autoQueue.confirm({ club: '7i' });
  autoQueue.enqueue({ ts: 1_800, strength: 0.6, holeId: HOLE_ID, start: undefined as any, lie: 'Rough' });
  autoQueue.confirm({ club: 'PW' });

  const candidates = collectAutoCandidates(HOLE_ID);
  const result = await PostHoleReconciler.reviewAndApply({
    holeId: HOLE_ID,
    picks: [
      { id: candidates[0]!.id, accept: true, club: '8i' },
      { id: candidates[1]!.id, accept: false },
    ],
  });

  expect(addShot).toHaveBeenCalledTimes(1);
  expect(addShot).toHaveBeenCalledWith(
    HOLE_ID,
    expect.objectContaining({ club: '8i', startLie: 'Fairway' }),
  );
  expect(result).toEqual({ applied: 1, rejected: 1 });
  expect(collectAutoCandidates(HOLE_ID)).toHaveLength(0);
  addShot.mockReset();
});
