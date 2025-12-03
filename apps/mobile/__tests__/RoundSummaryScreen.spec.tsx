import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';

import RoundSummaryScreen from '@app/screens/RoundSummaryScreen';
import { getRoundSummary, listRoundShots } from '@app/api/roundClient';

vi.mock('@app/api/roundClient');

const mockList = listRoundShots as unknown as Mock;
const mockSummary = getRoundSummary as unknown as Mock;

mockList.mockResolvedValue([
  {
    id: 's1',
    roundId: 'r1',
    holeNumber: 1,
    club: 'D',
    createdAt: '2024-01-01T10:00:00Z',
    startLat: 0,
    startLon: 0,
  },
  {
    id: 's2',
    roundId: 'r1',
    holeNumber: 2,
    club: '7i',
    createdAt: '2024-01-01T10:05:00Z',
    startLat: 0,
    startLon: 0,
    note: 'Nice swing',
    tempoRatio: 3,
  },
]);
mockSummary.mockResolvedValue({
  roundId: 'r1',
  totalStrokes: 72,
  totalPar: 70,
  totalToPar: 2,
  frontStrokes: 36,
  backStrokes: 36,
  totalPutts: 30,
  fairwaysHit: 7,
  fairwaysTotal: 14,
  girCount: 9,
  holesPlayed: 18,
});

describe('RoundSummaryScreen', () => {
  it('renders grouped shot list', async () => {
    const navigation = { navigate: vi.fn() } as any;
    const { getByText } = render(
      <RoundSummaryScreen navigation={navigation} route={{ params: { roundId: 'r1' } } as any} />,
    );

    await waitFor(() => expect(mockSummary).toHaveBeenCalled());
    expect(getByText('Hole 1')).toBeTruthy();
    expect(getByText('Hole 2')).toBeTruthy();
    expect(getByText(/Nice swing/)).toBeTruthy();
    expect(getByText(/Tempo: 3.0 : 1/)).toBeTruthy();
    expect(getByText(/Total: 72 \(\+2 vs 70\)/)).toBeTruthy();
    expect(getByText('Putts')).toBeTruthy();
    expect(getByText('7/14')).toBeTruthy();
  });
});
