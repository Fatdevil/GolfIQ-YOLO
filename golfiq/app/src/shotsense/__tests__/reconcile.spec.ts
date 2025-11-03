import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { PostHoleReconciler, __setConfirmHandlerForTest, __setRoundRecorderForTest } from '../PostHoleReconciler';
import { autoQueue } from '../AutoCaptureQueue';

const HOLE_ID = 5;

beforeEach(() => {
  autoQueue.finalizeHole(HOLE_ID);
  __setRoundRecorderForTest(null);
  __setConfirmHandlerForTest(null);
});

afterEach(() => {
  autoQueue.finalizeHole(HOLE_ID);
  __setRoundRecorderForTest(null);
  __setConfirmHandlerForTest(null);
  vi.clearAllMocks();
});

test('applies accepted shots when user confirms', async () => {
  const addShot = vi.fn().mockResolvedValue(null as any);
  __setRoundRecorderForTest({ addShot } as unknown as any);
  const confirm = vi.fn().mockResolvedValue(true);
  __setConfirmHandlerForTest(async (hole, shots) => {
    confirm(hole, shots);
    return true;
  });

  autoQueue.enqueue({ ts: 1_000, strength: 0.8, holeId: HOLE_ID, start: { lat: 1, lon: 2 }, lie: 'Fairway' });
  autoQueue.confirm({ club: '7i' });
  autoQueue.enqueue({ ts: 3_500, strength: 0.7, holeId: HOLE_ID, start: { lat: 1.1, lon: 2.1 }, lie: 'Rough' });
  autoQueue.confirm({ club: 'PW' });

  expect(autoQueue.getAcceptedShots(HOLE_ID)).toHaveLength(2);
  const result = await PostHoleReconciler.reviewAndApply({ holeId: HOLE_ID });

  expect(confirm).toHaveBeenCalledTimes(1);
  expect(confirm).toHaveBeenCalledWith(HOLE_ID, expect.arrayContaining([expect.objectContaining({ club: '7i' })]));
  expect(addShot).toHaveBeenCalledTimes(2);
  expect(autoQueue.getAcceptedShots(HOLE_ID)).toHaveLength(0);
  expect(result).toEqual({ applied: 2, rejected: 0 });
  addShot.mockReset();
});

test('skips when there are no accepted shots', async () => {
  const addShot = vi.fn().mockResolvedValue(null as any);
  __setRoundRecorderForTest({ addShot } as unknown as any);
  const confirm = vi.fn().mockResolvedValue(true);
  __setConfirmHandlerForTest(confirm);

  const result = await PostHoleReconciler.reviewAndApply({ holeId: HOLE_ID });

  expect(confirm).not.toHaveBeenCalled();
  expect(addShot).not.toHaveBeenCalled();
  expect(result).toEqual({ applied: 0, rejected: 0 });
  addShot.mockReset();
});

test('respects review decisions for accept and reject', async () => {
  const addShot = vi.fn().mockResolvedValue(null as any);
  __setRoundRecorderForTest({ addShot } as unknown as any);
  __setConfirmHandlerForTest(async () => {
    throw new Error('confirm should not be called when decisions are provided');
  });

  autoQueue.enqueue({ ts: 1_000, strength: 0.8, holeId: HOLE_ID, start: { lat: 1, lon: 2 }, lie: 'Fairway' });
  autoQueue.confirm({ club: '7i' });
  autoQueue.enqueue({ ts: 1_800, strength: 0.6, holeId: HOLE_ID, start: { lat: 1.2, lon: 2.2 }, lie: 'Rough' });
  autoQueue.confirm({ club: 'PW' });

  const pending = autoQueue.getAcceptedShots(HOLE_ID);
  expect(pending).toHaveLength(2);

  const [first, second] = pending;
  const result = await PostHoleReconciler.reviewAndApply({
    holeId: HOLE_ID,
    decisions: [
      { id: first.id, accepted: true, club: '8i' },
      { id: second.id, accepted: false },
    ],
  });

  expect(addShot).toHaveBeenCalledTimes(1);
  expect(addShot).toHaveBeenCalledWith(HOLE_ID, expect.objectContaining({ club: '8i' }));
  expect(result).toEqual({ applied: 1, rejected: 1 });
  expect(autoQueue.getAcceptedShots(HOLE_ID)).toHaveLength(0);
  addShot.mockReset();
});
