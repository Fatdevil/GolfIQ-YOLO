import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import RoundShotScreen from '@app/screens/RoundShotScreen';
import { appendShot, endRound, getRoundScores, updateHoleScore } from '@app/api/roundClient';
import { fetchCourseLayout } from '@app/api/courseClient';
import { fetchPlayerBag } from '@app/api/bagClient';
import { computeCaddieDecision } from '@app/caddie/CaddieDecisionEngine';
import { computeHoleCaddieTargets } from '@shared/round/autoHoleCore';
import { loadActiveRoundState, saveActiveRoundState } from '@app/round/roundState';
import { useGeolocation } from '@app/hooks/useGeolocation';
import { loadCaddieSettings } from '@app/caddie/caddieSettingsStorage';

vi.mock('@app/api/roundClient');
vi.mock('@app/api/courseClient');
vi.mock('@app/api/bagClient');
vi.mock('@app/caddie/CaddieDecisionEngine');
vi.mock('@shared/round/autoHoleCore');
vi.mock('@app/round/roundState');
vi.mock('@app/hooks/useGeolocation');
vi.mock('@app/caddie/caddieSettingsStorage');

const mockUpdateHoleScore = updateHoleScore as unknown as Mock;
const mockGetRoundScores = getRoundScores as unknown as Mock;
const mockFetchCourseLayout = fetchCourseLayout as unknown as Mock;
const mockFetchPlayerBag = fetchPlayerBag as unknown as Mock;
const mockComputeCaddieDecision = computeCaddieDecision as unknown as Mock;
const mockComputeHoleCaddieTargets = computeHoleCaddieTargets as unknown as Mock;
const mockLoadActiveRoundState = loadActiveRoundState as unknown as Mock;
const mockUseGeolocation = useGeolocation as unknown as Mock;
const mockLoadCaddieSettings = loadCaddieSettings as unknown as Mock;

const baseRoundState = {
  round: {
    id: 'round-1',
    courseId: 'course-1',
    courseName: 'Test Course',
    holes: 18,
    startHole: 1,
    startedAt: '2024-01-01T00:00:00Z',
  },
  currentHole: 1,
};

const sampleDecision = {
  holeNumber: 1,
  strategy: 'attack' as const,
  targetType: 'green' as const,
  targetDistanceM: 150,
  rawDistanceM: 150,
  recommendedClubId: '7i',
  explanation: 'Go for it',
};

describe('RoundShotScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockLoadActiveRoundState.mockResolvedValue(baseRoundState);
    (saveActiveRoundState as unknown as Mock).mockResolvedValue(undefined);
    (appendShot as unknown as Mock).mockResolvedValue(undefined);
    (endRound as unknown as Mock).mockResolvedValue(undefined);
    mockGetRoundScores.mockResolvedValue({
      roundId: 'round-1',
      holes: { 1: { holeNumber: 1, par: 4, strokes: 4 } },
    });
    mockUpdateHoleScore.mockResolvedValue({
      roundId: 'round-1',
      holes: { 1: { holeNumber: 1, par: 4, strokes: 4 } },
    });
    mockFetchCourseLayout.mockResolvedValue({ holes: [{ number: 1, par: 4, yardage_m: 350 }] });
    mockFetchPlayerBag.mockResolvedValue({ clubs: [{ clubId: '7i', label: '7 Iron' }] });
    mockComputeCaddieDecision.mockReturnValue(sampleDecision);
    mockComputeHoleCaddieTargets.mockReturnValue({ green: { carryDistanceM: 150 }, layup: null });
    mockUseGeolocation.mockReturnValue({ supported: false, position: null, error: null, loading: false });
    mockLoadCaddieSettings.mockResolvedValue({ riskProfile: 'default' });
  });

  it('sends caddie telemetry with follow=true when using recommended club', async () => {
    const navigation = { navigate: vi.fn() } as any;
    const { getByTestId } = render(
      <RoundShotScreen navigation={navigation} route={{ params: { roundId: 'round-1' } } as any} />,
    );

    await waitFor(() => expect(mockGetRoundScores).toHaveBeenCalled());
    await waitFor(() => expect(getByTestId('caddie-decision')).toBeTruthy());

    fireEvent.click(getByTestId('save-score'));

    await waitFor(() => expect(mockUpdateHoleScore).toHaveBeenCalled());
    const payload = mockUpdateHoleScore.mock.calls[0][2];
    expect(payload.caddieDecision).toBeTruthy();
    expect(payload.caddieDecision.recommendedClubId).toBe('7i');
    expect(payload.caddieDecision.followed).toBe(true);
  });

  it('marks telemetry as not followed when club differs', async () => {
    mockComputeCaddieDecision.mockReturnValueOnce({
      ...sampleDecision,
      recommendedClubId: '5i',
    });
    const navigation = { navigate: vi.fn() } as any;
    const { getByTestId } = render(
      <RoundShotScreen navigation={navigation} route={{ params: { roundId: 'round-1' } } as any} />,
    );

    await waitFor(() => expect(getByTestId('caddie-decision')).toBeTruthy());

    fireEvent.click(getByTestId('save-score'));
    await waitFor(() => expect(mockUpdateHoleScore).toHaveBeenCalled());

    const payload = mockUpdateHoleScore.mock.calls[mockUpdateHoleScore.mock.calls.length - 1][2];
    expect(payload.caddieDecision.followed).toBe(false);
    expect(payload.caddieDecision.recommendedClubId).toBe('5i');
  });
});
