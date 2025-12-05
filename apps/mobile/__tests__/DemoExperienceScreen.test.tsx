import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DemoExperienceScreen from '@app/screens/DemoExperienceScreen';
import { fetchDemoRoundRecap, fetchDemoWeeklySummary } from '@app/demo/demoService';
import type { RoundRecap } from '@app/api/roundClient';
import type { WeeklySummary } from '@app/api/weeklySummary';

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
  period: { from: '2024-01-01', to: '2024-01-07', roundCount: 3 },
  headline: { text: 'Solid week', emoji: '🔥' },
  coreStats: { avgScore: 72, bestScore: 70, worstScore: 75, avgToPar: 'E', holesPlayed: 54 },
  categories: {},
  focusHints: [],
  strokesGained: null,
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
    expect(getByText('Solid week')).toBeTruthy();

    fireEvent.click(getByText('Round recap'));
    expect(navigate).toHaveBeenCalledWith('RoundRecap', { roundId: 'demo-round', isDemo: true });

    fireEvent.click(getByText('Start your own round'));
    expect(navigate).toHaveBeenCalledWith('RoundStart');
  });
});
