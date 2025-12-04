import React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Share } from 'react-native';

import RoundRecapScreen from '@app/screens/RoundRecapScreen';
import { fetchRoundRecap } from '@app/api/roundClient';

vi.mock('@app/api/roundClient');

const mockFetchRecap = fetchRoundRecap as unknown as Mock;

const sampleRecap = {
  roundId: 'r1',
  courseName: 'Pebble Beach',
  date: '2024-03-01',
  score: 82,
  toPar: '+10',
  holesPlayed: 18,
  categories: {
    driving: { label: 'Driving', grade: 'C', value: 0.29 },
    approach: { label: 'Approach', grade: 'B', value: 0.5 },
    short_game: { label: 'Short Game', grade: 'A', value: 0.8 },
    putting: { label: 'Putting', grade: 'D', value: 2.5 },
  },
  focusHints: [
    'Work on driving accuracy – you hit 29% of fairways.',
    'Practice lag putting – 2.5 putts per hole.',
  ],
};

describe('RoundRecapScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders recap data and focus hints', async () => {
    mockFetchRecap.mockResolvedValue(sampleRecap);

    const { getByText, getByTestId } = render(
      <RoundRecapScreen navigation={{} as any} route={{ params: { roundId: 'r1' } } as any} />,
    );

    await waitFor(() => expect(mockFetchRecap).toHaveBeenCalled());

    expect(getByText('Pebble Beach')).toBeTruthy();
    expect(getByText('82 (+10)')).toBeTruthy();
    const drivingTile = getByTestId('recap-driving');
    expect(drivingTile).toBeTruthy();
    expect(within(drivingTile).getByText(/29%/)).toBeTruthy();
    expect(getByText(/Focus this week/)).toBeTruthy();
    expect(getByText(/driving accuracy/)).toBeTruthy();
  });

  it('shares summary text', async () => {
    mockFetchRecap.mockResolvedValue(sampleRecap);
    const shareSpy = vi.spyOn(Share, 'share').mockResolvedValue({} as any);

    const { getByTestId } = render(
      <RoundRecapScreen navigation={{} as any} route={{ params: { roundId: 'r1' } } as any} />,
    );

    await waitFor(() => expect(mockFetchRecap).toHaveBeenCalled());
    fireEvent.click(getByTestId('share-round'));

    await waitFor(() => expect(shareSpy).toHaveBeenCalled());
    const message = shareSpy.mock.calls[0][0].message;
    expect(message).toContain('Pebble Beach');
    expect(message).toContain('82');
    expect(message).toContain('Driving C');
  });

  it('shows an error state', async () => {
    mockFetchRecap.mockRejectedValue(new Error('nope'));

    const { getByText } = render(
      <RoundRecapScreen navigation={{} as any} route={{ params: { roundId: 'r1' } } as any} />,
    );

    await waitFor(() => expect(mockFetchRecap).toHaveBeenCalled());
    expect(getByText(/Unable to load/)).toBeTruthy();
  });
});
