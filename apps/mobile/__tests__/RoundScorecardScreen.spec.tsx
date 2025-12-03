import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';

import RoundScorecardScreen from '@app/screens/RoundScorecardScreen';
import { getRoundScores, getRoundSummary } from '@app/api/roundClient';

vi.mock('@app/api/roundClient');

const mockScores = getRoundScores as unknown as Mock;
const mockSummary = getRoundSummary as unknown as Mock;

mockScores.mockResolvedValue({
  roundId: 'r1',
  holes: {
    1: { holeNumber: 1, par: 4, strokes: 5, putts: 2 },
    2: { holeNumber: 2, par: 3, strokes: 3, putts: 1 },
    10: { holeNumber: 10, par: 5, strokes: 6, putts: 2 },
  },
});

mockSummary.mockResolvedValue({
  roundId: 'r1',
  totalStrokes: 14,
  totalPar: 12,
  totalToPar: 2,
  frontStrokes: 8,
  backStrokes: 6,
  totalPutts: 5,
  holesPlayed: 3,
});

describe('RoundScorecardScreen', () => {
  it('renders score rows with totals', async () => {
    const { getByText, getAllByText } = render(
      <RoundScorecardScreen navigation={undefined as any} route={{ params: { roundId: 'r1' } } as any} />,
    );

    await waitFor(() => expect(mockScores).toHaveBeenCalled());
    expect(getByText('Scorecard')).toBeTruthy();
    expect(getByText('14 (+2)')).toBeTruthy();
    expect(getByText(/Holes played: 3/)).toBeTruthy();
    expect(getByText('Front 9')).toBeTruthy();
    expect(getByText('Back 9')).toBeTruthy();
    expect(getAllByText('Par')[0]).toBeTruthy();
    expect(getAllByText('Strokes')[0]).toBeTruthy();
    expect(getByText('Front')).toBeTruthy();
    expect(getByText('Back')).toBeTruthy();
    expect(getByText('Totals')).toBeTruthy();
  });
});
