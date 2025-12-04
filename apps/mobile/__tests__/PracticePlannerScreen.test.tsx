import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import PracticePlannerScreen from '@app/screens/PracticePlannerScreen';
import { fetchAllDrills, fetchPracticePlan } from '@app/api/practiceClient';

vi.mock('@app/api/practiceClient', () => ({
  fetchPracticePlan: vi.fn(),
  fetchAllDrills: vi.fn(),
}));

const mockFetchPlan = fetchPracticePlan as unknown as Mock;
const mockFetchDrills = fetchAllDrills as unknown as Mock;

const navigation = { navigate: vi.fn() } as any;

const samplePlan = {
  focusCategories: ['driving', 'putting'],
  drills: [
    {
      id: 'drill-a',
      name: 'Fairway Finder',
      description: 'Hit to fairway',
      category: 'driving',
      focusMetric: 'fairways',
      difficulty: 'easy',
      durationMinutes: 15,
    },
    {
      id: 'drill-b',
      name: 'Lag Ladder',
      description: 'Lag putts',
      category: 'putting',
      focusMetric: '3_putts',
      difficulty: 'medium',
      durationMinutes: 15,
    },
  ],
};

const sampleDrills = [
  {
    id: 'drill-a',
    name: 'Fairway Finder',
    description: 'Hit to fairway',
    category: 'driving',
    focusMetric: 'fairways',
    difficulty: 'easy',
    durationMinutes: 15,
  },
  {
    id: 'drill-c',
    name: 'Up & Down',
    description: 'Short game reps',
    category: 'short_game',
    focusMetric: 'up_and_down',
    difficulty: 'medium',
    durationMinutes: 20,
  },
];

describe('PracticePlannerScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPlan.mockResolvedValue(samplePlan);
    mockFetchDrills.mockResolvedValue(sampleDrills);
  });

  it('renders focus categories and drills from the plan', async () => {
    const { getByTestId, getByText } = render(
      <PracticePlannerScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => getByTestId('plan-drill-drill-a'));
    expect(getByTestId('focus-driving')).toBeTruthy();
    expect(getByTestId('focus-putting')).toBeTruthy();
    expect(getByText('Fairway Finder')).toBeTruthy();
    expect(getByText('Lag Ladder')).toBeTruthy();
  });

  it('updates plan when duration is changed', async () => {
    const { getByTestId } = render(
      <PracticePlannerScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => getByTestId('plan-drill-drill-a'));
    fireEvent.press(getByTestId('duration-30'));

    await waitFor(() => {
      expect(mockFetchPlan).toHaveBeenCalledWith({ maxMinutes: 30 });
    });
  });

  it('shows library when toggled', async () => {
    const { getByTestId, getByText } = render(
      <PracticePlannerScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => getByTestId('toggle-library'));
    fireEvent.press(getByTestId('toggle-library'));

    await waitFor(() => getByTestId('library-drill-c'));
    expect(getByText('Up & Down')).toBeTruthy();
  });
});
