import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DemoExperienceScreen from '@app/screens/DemoExperienceScreen';
import { fetchDemoRoundRecap, fetchDemoWeeklySummary } from '@app/demo/demoService';
import type { RoundRecap } from '@app/api/roundClient';
import type { WeeklySummary } from '@app/api/weeklySummaryClient';

vi.mock('@app/demo/demoService', () => ({
  fetchDemoRoundRecap: vi.fn(),
  fetchDemoWeeklySummary: vi.fn(),
}));

const mockRecap: RoundRecap = {
  roundId: 'demo-round',
  courseName: 'Demo Links Hero',
  date: '2024-01-02',
  score: 72,
  toPar: 'E',
  holesPlayed: 18,
  categories: {
    driving: { label: 'Driving', grade: 'A', value: 0.8 },
    approach: { label: 'Approach', grade: 'B', value: 0.6 },
    short_game: { label: 'Short Game', grade: 'B', value: 0.6 },
    putting: { label: 'Putting', grade: 'A', value: 1.5 },
  },
  focusHints: [],
};

const mockWeekly: WeeklySummary = {
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-01-07T00:00:00Z',
  roundsPlayed: 3,
  holesPlayed: 54,
  highlight: { label: 'Best round', value: '72 (E)' },
  focusHints: [{ id: 'demo-hint', text: 'Keep the driver in play', category: 'driving' }],
};

describe('DemoExperienceScreen', () => {
  it('shows demo recap and weekly data with navigation shortcuts', async () => {
    vi.mocked(fetchDemoRoundRecap).mockResolvedValue({ recap: mockRecap });
    vi.mocked(fetchDemoWeeklySummary).mockResolvedValue(mockWeekly);
    const navigate = vi.fn();

    const { getByText } = render(
      <DemoExperienceScreen navigation={{ navigate } as any} route={{ key: 'DemoExperience', name: 'DemoExperience' } as any} />,
    );

    await waitFor(() => expect(getByText('Demo Links Hero')).toBeTruthy());
    expect(getByText('This week')).toBeTruthy();
    expect(getByText(/72/)).toBeTruthy();

    fireEvent.click(getByText('Round recap'));
    expect(navigate).toHaveBeenCalledWith('RoundRecap', { roundId: 'demo-round', isDemo: true });

    fireEvent.click(getByText('Start your own round'));
    expect(navigate).toHaveBeenCalledWith('RoundStart');
  });
});
