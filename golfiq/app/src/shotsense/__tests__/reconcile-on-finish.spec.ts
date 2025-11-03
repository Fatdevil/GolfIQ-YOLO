import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { RoundState } from '../../../../shared/round/types';
import { autoQueue } from '../AutoCaptureQueue';
import { __setConfirmHandlerForTest, __setRoundRecorderForTest, reconcileIfPending } from '../PostHoleReconciler';
import FollowScreen from '../../screens/FollowScreen';

const HOLE_ID = 18;

const addShotMock = vi.fn();
const finishRoundMock = vi.fn<(finishedAt?: number) => Promise<RoundState>>();
const getStoredRoundMock = vi.fn<[], Promise<RoundState | null>>();
const getCurrentHoleIdMock = vi.fn<[], number>();
const nextHoleMock = vi.fn();
const prevHoleMock = vi.fn();

let wizardStartPayload: { round: RoundState; meta: { courseId: string; courseName: string; holeCount: number; tournamentSafe: boolean; startedAt: number } } | null = null;

vi.mock('../../follow/useFollowLoop', () => {
  return {
    useFollowLoop: vi.fn(() => ({
      followState: { autoAdvanceEnabled: true },
      snapshot: { holeNo: HOLE_ID, fmb: { front: 120, middle: 130, back: 140 } },
      gpsWeak: false,
      watchAutoSend: true,
      setWatchAutoSend: vi.fn(),
      setAutoAdvance: vi.fn(),
      autoMode: 'v2' as const,
      setAutoMode: vi.fn(),
      manualNext: vi.fn().mockResolvedValue(undefined),
      manualPrev: vi.fn().mockResolvedValue(undefined),
      recenter: vi.fn(),
    })),
  };
});

vi.mock('../../components/overlay/OverlayControls', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('../../components/overlay/VectorHole', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('../../components/shotsense/AutoReviewBanner', () => ({
  AutoReviewBanner: () => null,
}));

vi.mock('../../watch/bridge', () => ({
  notifyRoundSaved: vi.fn(),
}));

vi.mock('../../../../shared/bag/storage', () => ({
  loadBagStats: vi.fn(async () => ({ updatedAt: 0, clubs: {} })),
}));

vi.mock('../../../../shared/sg/baseline', () => ({
  loadDefaultBaselines: vi.fn(() => ({})),
}));

vi.mock('../../../../shared/round/summary', () => ({
  buildRoundSummary: vi.fn(() => ({
    strokes: 70,
    toPar: 2,
    putts: 32,
    penalties: 1,
    firPct: 0.5,
    girPct: 0.6,
    phases: { ott: 0, app: 0, arg: 0, putt: 0, total: 0 },
    clubs: [],
    holes: [],
  })),
}));

vi.mock('../../../../shared/telemetry/round', () => ({
  recordRoundFinish: vi.fn(),
}));

vi.mock('../../screens/RoundSummaryScreen', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('../../screens/RoundWizard', () => ({
  __esModule: true,
  default: ({ onStart }: { onStart: (payload: { round: RoundState; meta: { courseId: string; courseName: string; holeCount: number; tournamentSafe: boolean; startedAt: number } }) => void }) => {
    React.useEffect(() => {
      if (wizardStartPayload) {
        onStart(wizardStartPayload);
      }
    }, [onStart]);
    return null;
  },
}));

vi.mock('../../../../shared/round/recorder', () => ({
  RoundRecorder: {
    addShot: addShotMock,
    finishRound: (...args: Parameters<typeof finishRoundMock>) => finishRoundMock(...args),
    getStoredRound: (...args: Parameters<typeof getStoredRoundMock>) => getStoredRoundMock(...args),
    getCurrentHoleId: (...args: Parameters<typeof getCurrentHoleIdMock>) => getCurrentHoleIdMock(...args),
    nextHole: nextHoleMock,
    prevHole: prevHoleMock,
    resumeRound: vi.fn(),
    getActiveRound: vi.fn(),
    startRound: vi.fn(),
    setPin: vi.fn(),
    addPenalty: vi.fn(),
    setPuttCount: vi.fn(),
    setManualScore: vi.fn(),
    clearRound: vi.fn(),
    advanceHole: vi.fn(),
    holeOut: vi.fn(),
  },
}));

describe('reconcile on finish', () => {
  let activeRound: RoundState;

  beforeEach(() => {
    addShotMock.mockResolvedValue(null as any);
    getCurrentHoleIdMock.mockReturnValue(HOLE_ID);
    activeRound = {
      id: 'round-1',
      courseId: 'test-course',
      startedAt: 1000,
      currentHole: HOLE_ID,
      holes: {
        [HOLE_ID]: { hole: HOLE_ID, par: 4, shots: [] },
      },
      tournamentSafe: false,
    };
    wizardStartPayload = {
      round: activeRound,
      meta: {
        courseId: activeRound.courseId,
        courseName: activeRound.courseId,
        holeCount: Object.keys(activeRound.holes).length,
        tournamentSafe: activeRound.tournamentSafe,
        startedAt: activeRound.startedAt,
      },
    };
    getStoredRoundMock.mockResolvedValue(activeRound);
    finishRoundMock.mockImplementation(async (finishedAt?: number) => ({
      ...activeRound,
      finishedAt: finishedAt ?? Date.now(),
    }));
    autoQueue.markHoleReviewed(HOLE_ID);
    __setRoundRecorderForTest(null);
    __setConfirmHandlerForTest(async () => true);
  });

  afterEach(() => {
    autoQueue.markHoleReviewed(HOLE_ID);
    __setConfirmHandlerForTest(null);
    __setRoundRecorderForTest(null);
    addShotMock.mockReset();
    finishRoundMock.mockReset();
    getStoredRoundMock.mockReset();
    getCurrentHoleIdMock.mockReset();
    nextHoleMock.mockReset();
    prevHoleMock.mockReset();
    wizardStartPayload = null;
    vi.clearAllMocks();
  });

  test('applies on finish', async () => {
    autoQueue.enqueue({ ts: 1_000, strength: 0.8, holeId: HOLE_ID, start: { lat: 1, lon: 2 }, lie: 'Fairway' });
    autoQueue.confirm({ club: '7i' });

    const screen = render(<FollowScreen />);

    const finishButton = await screen.findByTestId('finish-round-button');
    await act(async () => {
      fireEvent.press(finishButton);
    });

    const confirmButton = await screen.findByTestId('finish-round-confirm');
    await act(async () => {
      fireEvent.press(confirmButton);
    });

    await waitFor(() => expect(finishRoundMock).toHaveBeenCalled());
    expect(addShotMock).toHaveBeenCalledTimes(1);
    expect(autoQueue.getAcceptedShots(HOLE_ID)).toHaveLength(0);
  });

  test('idempotent on double invocation', async () => {
    autoQueue.enqueue({ ts: 2_000, strength: 0.7, holeId: HOLE_ID, start: { lat: 3, lon: 4 }, lie: 'Fairway' });
    autoQueue.confirm({ club: 'PW' });

    const first = await reconcileIfPending(HOLE_ID);
    expect(first).toBe(1);
    expect(addShotMock).toHaveBeenCalledTimes(1);

    const second = await reconcileIfPending(HOLE_ID);
    expect(second).toBe(0);
    expect(addShotMock).toHaveBeenCalledTimes(1);
  });

  test('no-op when empty', async () => {
    const screen = render(<FollowScreen />);

    const finishButton = await screen.findByTestId('finish-round-button');
    await act(async () => {
      fireEvent.press(finishButton);
    });

    const confirmButton = await screen.findByTestId('finish-round-confirm');
    await act(async () => {
      fireEvent.press(confirmButton);
    });

    await waitFor(() => expect(finishRoundMock).toHaveBeenCalled());
    expect(addShotMock).not.toHaveBeenCalled();
  });
});
