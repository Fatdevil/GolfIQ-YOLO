import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';

import RoundSummaryScreen from '@app/screens/RoundSummaryScreen';
import { listRoundShots } from '@app/api/roundClient';

vi.mock('@app/api/roundClient');

const mockList = listRoundShots as unknown as Mock;

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

describe('RoundSummaryScreen', () => {
  it('renders grouped shot list', async () => {
    const { getByText } = render(
      <RoundSummaryScreen navigation={undefined as any} route={{ params: { roundId: 'r1' } } as any} />,
    );

    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(getByText('Hole 1')).toBeTruthy();
    expect(getByText('Hole 2')).toBeTruthy();
    expect(getByText(/Nice swing/)).toBeTruthy();
    expect(getByText(/Tempo: 3.0 : 1/)).toBeTruthy();
  });
});
