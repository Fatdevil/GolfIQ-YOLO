import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import StartRoundV2Screen from '@app/screens/StartRoundV2Screen';
import {
  fetchActiveRoundSummary,
  getCurrentRound,
  startRound,
  type ActiveRoundSummary,
  type RoundInfo,
} from '@app/api/roundClient';
import { fetchCourses } from '@app/api/courseClient';
import { loadActiveRoundState, saveActiveRoundState } from '@app/round/roundState';
import { getItem, setItem } from '@app/storage/asyncStorage';
import * as roundFlowAnalytics from '@app/analytics/roundFlow';

vi.mock('@app/api/roundClient');
vi.mock('@app/api/courseClient');
vi.mock('@app/round/roundState');
vi.mock('@app/storage/asyncStorage');
vi.mock('@app/analytics/roundFlow', () => ({
  logRoundStartOpened: vi.fn(),
  logRoundResumeClicked: vi.fn(),
  logRoundCreateClicked: vi.fn(),
  logRoundCreatedSuccess: vi.fn(),
  logRoundCreatedFailed: vi.fn(),
  logRoundFlowV2StartRoundRequest: vi.fn(),
  logRoundFlowV2StartRoundResponse: vi.fn(),
}));

const mockFetchActiveRoundSummary = fetchActiveRoundSummary as unknown as Mock;
const mockGetCurrentRound = getCurrentRound as unknown as Mock;
const mockStartRound = startRound as unknown as Mock;
const mockFetchCourses = fetchCourses as unknown as Mock;
const mockLoadActiveRoundState = loadActiveRoundState as unknown as Mock;
const mockSaveActiveRoundState = saveActiveRoundState as unknown as Mock;
const mockGetItem = getItem as unknown as Mock;
const mockSetItem = setItem as unknown as Mock;

function createRoundInfo(): RoundInfo {
  return {
    id: 'r1',
    holes: 18,
    startHole: 1,
    status: 'in_progress',
    startedAt: 'today',
  };
}

function createActiveSummary(): ActiveRoundSummary {
  return {
    roundId: 'r1',
    courseName: 'Demo Course',
    startedAt: 'today',
    holesPlayed: 3,
    currentHole: 4,
  };
}

describe('StartRoundV2Screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchActiveRoundSummary.mockResolvedValue(null);
    mockGetCurrentRound.mockResolvedValue(null);
    mockStartRound.mockResolvedValue({ id: 'new-round', holes: 18, startHole: 1, startedAt: 'now' });
    mockFetchCourses.mockResolvedValue([{ id: 'c1', name: 'Course One', holeCount: 18 }]);
    mockLoadActiveRoundState.mockResolvedValue(null);
    mockSaveActiveRoundState.mockResolvedValue(undefined);
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
  });

  it('shows start-new UI when no active round', async () => {
    const navigation = { navigate: vi.fn() } as any;

    const { getByTestId, queryByTestId } = render(
      <StartRoundV2Screen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('start-round-button')).toBeTruthy());
    expect(queryByTestId('resume-round')).toBeNull();
  });

  it('renders resume card and navigates to round', async () => {
    const navigation = { navigate: vi.fn() } as any;
    mockFetchActiveRoundSummary.mockResolvedValue(createActiveSummary());
    mockGetCurrentRound.mockResolvedValue(createRoundInfo());

    const { getByTestId } = render(
      <StartRoundV2Screen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('resume-round')).toBeTruthy());
    fireEvent.click(getByTestId('resume-round'));

    await waitFor(() => expect(mockSaveActiveRoundState).toHaveBeenCalled());
    expect(navigation.navigate).toHaveBeenCalledWith('RoundShot', { roundId: 'r1' });
  });

  it('starts a new round when CTA is tapped', async () => {
    const navigation = { navigate: vi.fn() } as any;

    const { getByTestId } = render(
      <StartRoundV2Screen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('start-round-button')).toBeTruthy());
    fireEvent.click(getByTestId('start-round-button'));

    await waitFor(() => expect(mockStartRound).toHaveBeenCalled());
    expect(navigation.navigate).toHaveBeenCalledWith('RoundShot', { roundId: 'new-round' });
  });

  it('propagates stored tournament-safe preference when starting a round', async () => {
    const navigation = { navigate: vi.fn() } as any;
    mockGetItem.mockResolvedValue('true');

    const { getByTestId } = render(
      <StartRoundV2Screen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('start-round-button')).toBeTruthy());
    fireEvent.click(getByTestId('start-round-button'));

    await waitFor(() => expect(mockSaveActiveRoundState).toHaveBeenCalled());
    expect(mockSaveActiveRoundState).toHaveBeenCalledWith(
      expect.objectContaining({ preferences: { tournamentSafe: true } }),
    );
    expect(mockSetItem).toHaveBeenCalledWith('golfiq.tournamentSafePref.v1', 'true');
  });

  it('resumes an existing round when start responds with reuse flag', async () => {
    const navigation = { navigate: vi.fn() } as any;
    mockStartRound.mockResolvedValue({
      id: 'r1',
      holes: 18,
      startHole: 1,
      startedAt: 'now',
      reusedActiveRound: true,
    });
    mockFetchActiveRoundSummary.mockResolvedValue(createActiveSummary());
    mockGetCurrentRound.mockResolvedValue(createRoundInfo());

    const { getByTestId } = render(
      <StartRoundV2Screen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('start-round-button')).toBeTruthy());
    fireEvent.click(getByTestId('start-round-button'));

    await waitFor(() =>
      expect(mockSaveActiveRoundState).toHaveBeenCalledWith(
        expect.objectContaining({ currentHole: 4 }),
      ),
    );
    expect(navigation.navigate).toHaveBeenCalledWith('RoundShot', { roundId: 'r1' });
    expect(roundFlowAnalytics.logRoundFlowV2StartRoundResponse).toHaveBeenCalledWith(
      expect.objectContaining({ reusedActiveRound: true }),
    );
  });

  it('keeps UI usable when active round fetch fails', async () => {
    const navigation = { navigate: vi.fn() } as any;
    mockFetchActiveRoundSummary.mockRejectedValueOnce(new Error('network'));

    const { getByTestId } = render(
      <StartRoundV2Screen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('start-round-button')).toBeTruthy());
  });
});
