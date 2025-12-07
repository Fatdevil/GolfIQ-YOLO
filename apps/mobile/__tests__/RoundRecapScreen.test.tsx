import React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Share } from 'react-native';

import RoundRecapScreen from '@app/screens/RoundRecapScreen';
import { fetchRoundRecap } from '@app/api/roundClient';
import { fetchRoundStrokesGained } from '@app/api/strokesGainedClient';
import { createRoundShareLink } from '@app/api/shareClient';
import { fetchPlayerBag } from '@app/api/bagClient';
import { fetchBagStats } from '@app/api/bagStatsClient';

vi.mock('@app/api/roundClient');
vi.mock('@app/api/strokesGainedClient');
vi.mock('@app/api/shareClient', () => ({
  createRoundShareLink: vi.fn(),
}));
vi.mock('@app/api/bagClient');
vi.mock('@app/api/bagStatsClient');

const mockFetchRecap = fetchRoundRecap as unknown as Mock;
const mockFetchRoundStrokesGained = fetchRoundStrokesGained as unknown as Mock;
const mockCreateRoundShareLink = createRoundShareLink as unknown as Mock;
const mockFetchPlayerBag = fetchPlayerBag as unknown as Mock;
const mockFetchBagStats = fetchBagStats as unknown as Mock;

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
  caddieSummary: {
    totalDecisions: 3,
    followedDecisions: 2,
    followRate: 0.67,
    notes: ['You tended to follow the caddie and often scored better when you did.'],
  },
};

const sampleStrokes = {
  roundId: 'r1',
  total: 0.7,
  categories: {
    driving: { label: 'Driving', grade: 'B', value: 0.8, comment: 'Fairways: 70%' },
    approach: { label: 'Approach', grade: 'B', value: 0.2, comment: 'GIR 55%' },
    short_game: { label: 'Short Game', grade: 'C', value: -0.1, comment: '1.0 per hole' },
    putting: { label: 'Putting', grade: 'A', value: -0.2, comment: '1.7 putts' },
  },
};

const sampleBag = {
  clubs: [
    { clubId: 'pw', label: 'PW', avgCarryM: 110, sampleCount: 0, active: true },
    { clubId: '8i', label: '8i', avgCarryM: 140, sampleCount: 0, active: true },
    { clubId: '5i', label: '5i', avgCarryM: 195, sampleCount: 0, active: true },
  ],
};

const sampleBagStats = {
  pw: { clubId: 'pw', meanDistanceM: 112, sampleCount: 8 },
  '8i': { clubId: '8i', meanDistanceM: 150, sampleCount: 8 },
  '5i': { clubId: '5i', meanDistanceM: 215, sampleCount: 8 },
};

describe('RoundRecapScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateRoundShareLink.mockResolvedValue({ url: 'https://golfiq.app/s/abc123' });
    mockFetchPlayerBag.mockResolvedValue(sampleBag);
    mockFetchBagStats.mockResolvedValue(sampleBagStats);
  });

  it('renders recap data and focus hints', async () => {
    mockFetchRecap.mockResolvedValue(sampleRecap);
    mockFetchRoundStrokesGained.mockResolvedValue(sampleStrokes);

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
    expect(getByTestId('recap-sg-driving')).toBeTruthy();
    expect(getByText('+0.8')).toBeTruthy();
    const caddieSummary = getByTestId('caddie-summary');
    expect(caddieSummary).toBeTruthy();
    expect(within(caddieSummary).getByText(/Decisions followed: 2\/3/)).toBeTruthy();
    expect(within(caddieSummary).getByText(/follow the caddie/)).toBeTruthy();
  });

  it('shares summary text', async () => {
    mockFetchRecap.mockResolvedValue(sampleRecap);
    mockFetchRoundStrokesGained.mockResolvedValue(sampleStrokes);
    const shareSpy = vi.spyOn(Share, 'share').mockResolvedValue({} as any);

    const { getByTestId } = render(
      <RoundRecapScreen navigation={{} as any} route={{ params: { roundId: 'r1' } } as any} />,
    );

    await waitFor(() => expect(mockFetchRecap).toHaveBeenCalled());
    const shareButton = await waitFor(() => getByTestId('share-round'));
    fireEvent.click(shareButton);

    await waitFor(() => expect(shareSpy).toHaveBeenCalled());
    const message = shareSpy.mock.calls[0][0].message;
    expect(message).toContain('Pebble Beach');
    expect(message).toContain('82');
    expect(message).toContain('https://golfiq.app/s/abc123');
  });

  it('falls back to offline share text on link failure', async () => {
    mockFetchRecap.mockResolvedValue(sampleRecap);
    mockFetchRoundStrokesGained.mockResolvedValue(sampleStrokes);
    mockCreateRoundShareLink.mockRejectedValue(new Error('fail'));
    const shareSpy = vi.spyOn(Share, 'share').mockResolvedValue({} as any);

    const { getByTestId } = render(
      <RoundRecapScreen navigation={{} as any} route={{ params: { roundId: 'r1' } } as any} />,
    );

    await waitFor(() => expect(mockFetchRecap).toHaveBeenCalled());
    fireEvent.click(getByTestId('share-round'));

    await waitFor(() => expect(shareSpy).toHaveBeenCalled());
    const message = shareSpy.mock.calls[0][0].message;
    expect(message).toContain('Great round at Pebble Beach');
    expect(message).not.toContain('http');
  });

  it('shows an error state', async () => {
    mockFetchRecap.mockRejectedValue(new Error('nope'));
    mockFetchRoundStrokesGained.mockResolvedValue(sampleStrokes);

    const { getByText } = render(
      <RoundRecapScreen navigation={{} as any} route={{ params: { roundId: 'r1' } } as any} />,
    );

    await waitFor(() => expect(mockFetchRecap).toHaveBeenCalled());
    expect(getByText(/Unable to load/)).toBeTruthy();
  });

  it('continues when strokes gained fails', async () => {
    mockFetchRecap.mockResolvedValue(sampleRecap);
    mockFetchRoundStrokesGained.mockRejectedValue(new Error('no strokes'));

    const { getByText, queryByTestId } = render(
      <RoundRecapScreen navigation={{} as any} route={{ params: { roundId: 'r1' } } as any} />,
    );

    await waitFor(() => expect(mockFetchRecap).toHaveBeenCalled());
    expect(queryByTestId('recap-sg-driving')).toBeNull();
    expect(getByText('Strokes Gained unavailable right now.')).toBeTruthy();
  });

  it('shows bag readiness recap info and suggestion', async () => {
    mockFetchRecap.mockResolvedValue(sampleRecap);
    mockFetchRoundStrokesGained.mockResolvedValue(sampleStrokes);
    const navigate = vi.fn();

    const { getByTestId, getByText } = render(
      <RoundRecapScreen navigation={{ navigate } as any} route={{ params: { roundId: 'r1' } } as any} />,
    );

    const readinessCard = await waitFor(() => getByTestId('recap-bag-readiness'));
    expect(readinessCard).toBeTruthy();
    expect(getByText(/Bag readiness/)).toBeTruthy();
    expect(getByText(/Suggestion:/)).toBeTruthy();
  });

  it('navigates to My Bag from the recap panel', async () => {
    mockFetchRecap.mockResolvedValue(sampleRecap);
    mockFetchRoundStrokesGained.mockResolvedValue(sampleStrokes);
    const navigate = vi.fn();

    const { getByTestId } = render(
      <RoundRecapScreen navigation={{ navigate } as any} route={{ params: { roundId: 'r1' } } as any} />,
    );

    await waitFor(() => getByTestId('recap-bag-readiness'));
    fireEvent.click(getByTestId('recap-open-bag'));

    expect(navigate).toHaveBeenCalledWith('MyBag');
  });

  it('hides readiness recap when bag data is missing', async () => {
    mockFetchRecap.mockResolvedValue(sampleRecap);
    mockFetchRoundStrokesGained.mockResolvedValue(sampleStrokes);
    mockFetchPlayerBag.mockResolvedValueOnce({ clubs: [] });
    mockFetchBagStats.mockResolvedValueOnce(null);

    const { queryByTestId } = render(
      <RoundRecapScreen navigation={{} as any} route={{ params: { roundId: 'r1' } } as any} />,
    );

    await waitFor(() => expect(mockFetchRecap).toHaveBeenCalled());
    expect(queryByTestId('recap-bag-readiness')).toBeNull();
  });
});
