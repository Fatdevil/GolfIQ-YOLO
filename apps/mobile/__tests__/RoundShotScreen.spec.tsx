import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import RoundShotScreen from '@app/screens/RoundShotScreen';
import { appendShot, endRound, getRoundScores, updateHoleScore } from '@app/api/roundClient';
import {
  clearActiveRoundState,
  loadActiveRoundState,
  saveActiveRoundState,
  type ActiveRoundState,
} from '@app/round/roundState';

vi.mock('@app/api/roundClient');
vi.mock('@app/round/roundState');

const mockAppendShot = appendShot as unknown as Mock;
const mockEndRound = endRound as unknown as Mock;
const mockUpdateHoleScore = updateHoleScore as unknown as Mock;
const mockGetScores = getRoundScores as unknown as Mock;
const mockLoad = loadActiveRoundState as unknown as Mock;
const mockSave = saveActiveRoundState as unknown as Mock;
const mockClear = clearActiveRoundState as unknown as Mock;

const sampleState: ActiveRoundState = {
  round: { id: 'r1', holes: 18, startedAt: 'now' },
  currentHole: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLoad.mockResolvedValue(sampleState);
  mockAppendShot.mockResolvedValue({
    id: 's1',
    roundId: 'r1',
    holeNumber: 1,
    club: '7i',
    createdAt: new Date().toISOString(),
    startLat: 0,
    startLon: 0,
  });
  mockEndRound.mockResolvedValue({ ...sampleState.round, endedAt: 'later' });
  mockUpdateHoleScore.mockResolvedValue({ roundId: 'r1', holes: {} });
  mockGetScores.mockResolvedValue({ roundId: 'r1', holes: {} });
  mockSave.mockResolvedValue(undefined);
  mockClear.mockResolvedValue(undefined);
});

(global as any).navigator = {
  geolocation: {
    getCurrentPosition: (success: any) => success({ coords: { latitude: 1, longitude: 2 } }),
  },
};

describe('RoundShotScreen', () => {
  it('logs a shot using current hole and club selection', async () => {
    const navigation = { navigate: vi.fn() } as any;
    const { getByTestId, getByPlaceholderText } = render(
      <RoundShotScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());

    fireEvent.change(getByPlaceholderText('Optional note'), { target: { value: 'Great swing' } });
    fireEvent.click(getByTestId('log-shot'));

    await waitFor(() => expect(mockAppendShot).toHaveBeenCalled());
    expect(mockAppendShot).toHaveBeenCalledWith('r1', expect.objectContaining({
      holeNumber: 1,
      club: '7i',
      startLat: 1,
      startLon: 2,
      note: 'Great swing',
    }));
  });

  it('ends round and navigates to summary', async () => {
    const navigation = { navigate: vi.fn() } as any;
    const { getByText } = render(<RoundShotScreen navigation={navigation} route={undefined as any} />);

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());
    fireEvent.click(getByText('End round'));

    await waitFor(() => expect(mockEndRound).toHaveBeenCalled());
    expect(mockClear).toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('RoundRecap', { roundId: 'r1' });
  });

  it('advances to the next hole and persists state', async () => {
    const { getByText } = render(<RoundShotScreen navigation={{} as any} route={undefined as any} />);

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());
    fireEvent.click(getByText('Next hole'));

    await waitFor(() => expect(mockSave).toHaveBeenCalledWith({
      ...sampleState,
      currentHole: 2,
    }));
  });

  it('saves scoring changes', async () => {
    const { getByLabelText, getByTestId } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());
    fireEvent.click(getByLabelText('Increase strokes'));
    fireEvent.click(getByTestId('save-score'));

    await waitFor(() => expect(mockUpdateHoleScore).toHaveBeenCalledWith('r1', 1, expect.any(Object)));
  });

  it('renders fallback when no active round exists', async () => {
    mockLoad.mockResolvedValueOnce(null);
    const { findByText } = render(
      <RoundShotScreen navigation={{ navigate: vi.fn() } as any} route={undefined as any} />,
    );

    expect(await findByText('No active round. Start a new one to log shots.')).toBeTruthy();
  });

  it('does not end round when scoring save fails', async () => {
    mockUpdateHoleScore.mockRejectedValueOnce(new Error('boom'));
    const navigation = { navigate: vi.fn() } as any;
    const { getByLabelText, getByText } = render(
      <RoundShotScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());
    fireEvent.click(getByLabelText('Increase strokes'));
    fireEvent.click(getByText('End round'));

    await waitFor(() => expect(mockUpdateHoleScore).toHaveBeenCalled());
    expect(mockEndRound).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(getByText('Hole 1')).toBeTruthy();
  });

  it('stays on current hole when save fails on next hole', async () => {
    mockUpdateHoleScore.mockRejectedValueOnce(new Error('network'));
    const { getByLabelText, getByText, queryByText } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());
    fireEvent.click(getByLabelText('Increase strokes'));
    fireEvent.click(getByText('Next hole'));

    await waitFor(() => expect(mockUpdateHoleScore).toHaveBeenCalled());
    expect(mockSave).not.toHaveBeenCalled();
    expect(queryByText('Hole 2')).toBeNull();
    expect(getByText('Hole 1')).toBeTruthy();
  });
});
