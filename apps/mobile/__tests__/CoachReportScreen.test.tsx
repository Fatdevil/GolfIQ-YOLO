import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';

import CoachReportScreen from '@app/screens/CoachReportScreen';
import { fetchCoachRoundSummary, ProRequiredError, type CoachRoundSummary } from '@app/api/coachClient';

vi.mock('@app/api/coachClient');

const mockFetchCoachRoundSummary = fetchCoachRoundSummary as unknown as Mock;

const sampleSummary: CoachRoundSummary = {
  roundId: 'round-1',
  courseName: 'Pebble Beach',
  date: '2024-04-01',
  headline: 'Your wedges carried this round.',
  score: 82,
  toPar: '+10',
  strokesGained: {
    total: 1.3,
    driving: -0.5,
    approach: 0.8,
    shortGame: 0.4,
    putting: 0.6,
  },
  focus: ['Driving accuracy is your #1 leak.', 'Maintain your strong putting routine.'],
  recommendedDrills: [
    { id: 'drv_fairways_ladder', name: 'Fairway ladder', category: 'driving' },
    { id: 'putt_distance', name: 'Distance control', category: 'putting' },
  ],
};

describe('CoachReportScreen', () => {
  it('renders coach report details', async () => {
    mockFetchCoachRoundSummary.mockResolvedValue(sampleSummary);
    const navigation = { navigate: vi.fn(), goBack: vi.fn() } as any;

    const { getByText, getByTestId } = render(
      <CoachReportScreen navigation={navigation} route={{ params: { roundId: 'round-1' } } as any} />,
    );

    await waitFor(() => expect(mockFetchCoachRoundSummary).toHaveBeenCalledWith('round-1'));

    expect(getByText('Coach Report')).toBeTruthy();
    expect(getByText('Pebble Beach')).toBeTruthy();
    expect(getByText('82 (+10)')).toBeTruthy();
    expect(getByTestId('coach-headline')).toHaveTextContent('wedges carried');
    expect(getByText(/Driving accuracy is your #1 leak/)).toBeTruthy();
    expect(getByText('Fairway ladder')).toBeTruthy();
    expect(getByText('+1.3')).toBeTruthy();
  });

  it('navigates to practice planner with recommended drills', async () => {
    mockFetchCoachRoundSummary.mockResolvedValue(sampleSummary);
    const navigation = { navigate: vi.fn(), goBack: vi.fn() } as any;

    const { getByTestId } = render(
      <CoachReportScreen navigation={navigation} route={{ params: { roundId: 'round-1' } } as any} />,
    );

    await waitFor(() => getByTestId('start-practice-button'));
    fireEvent.click(getByTestId('start-practice-button'));

    expect(navigation.navigate).toHaveBeenCalledWith('PracticePlanner', {
      focusDrillIds: ['drv_fairways_ladder', 'putt_distance'],
      maxMinutes: 60,
    });
  });

  it('shows pro required overlay when gated', async () => {
    mockFetchCoachRoundSummary.mockRejectedValue(new ProRequiredError('pro-only'));
    const navigation = { navigate: vi.fn(), goBack: vi.fn() } as any;

    const { getByTestId, queryByText } = render(
      <CoachReportScreen navigation={navigation} route={{ params: { roundId: 'round-2' } } as any} />,
    );

    await waitFor(() => expect(getByTestId('coach-pro-overlay')).toBeTruthy());
    expect(queryByText('Loading coach insights…')).toBeNull();
  });

  it('renders error fallback and retries', async () => {
    mockFetchCoachRoundSummary
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(sampleSummary);
    const navigation = { navigate: vi.fn(), goBack: vi.fn() } as any;

    const { getByTestId, getByText } = render(
      <CoachReportScreen navigation={navigation} route={{ params: { roundId: 'round-3' } } as any} />,
    );

    await waitFor(() => expect(getByText('Unable to load coach report.')).toBeTruthy());
    fireEvent.click(getByTestId('coach-report-retry'));

    await waitFor(() => expect(mockFetchCoachRoundSummary.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});
