import React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import PracticePlannerScreen from '@app/screens/PracticePlannerScreen';
import {
  getWeekStartISO,
  loadCurrentWeekPracticePlan,
  loadPracticePlan,
  savePracticePlan,
} from '@app/practice/practicePlanStorage';
import { fetchPracticePlanFromDrills } from '@app/api/practiceClient';

const catalog = vi.hoisted(() => [
  {
    id: 'putting-lag-ladder',
    category: 'putting',
    titleKey: 'practiceDrills.putting_lag_title',
    descriptionKey: 'practiceDrills.putting_lag_desc',
    durationMin: 12,
    tags: [],
  },
]);

vi.mock('@app/practice/practicePlanStorage', () => ({
  loadPracticePlan: vi.fn(),
  loadCurrentWeekPracticePlan: vi.fn(),
  savePracticePlan: vi.fn(),
  getWeekStartISO: vi.fn(),
  serializePracticePlanWrite: (op: () => Promise<unknown> | unknown) => Promise.resolve().then(op),
}));

vi.mock('@app/practice/drillsCatalog', () => ({
  DRILLS_CATALOG: catalog,
  findDrillById: (id: string) => catalog.find((drill) => drill.id === id),
}));

vi.mock('@app/api/practiceClient', () => ({
  fetchPracticePlanFromDrills: vi.fn(),
}));

const mockLoadPlan = loadPracticePlan as unknown as Mock;
const mockLoadCurrentWeekPlan = loadCurrentWeekPracticePlan as unknown as Mock;
const mockSavePlan = savePracticePlan as unknown as Mock;
const mockGetWeekStartISO = getWeekStartISO as unknown as Mock;
const mockFetchPlanFromDrills = fetchPracticePlanFromDrills as unknown as Mock;

const navigation = { navigate: vi.fn() } as any;

describe('PracticePlannerScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWeekStartISO.mockReturnValue('2024-01-01T00:00:00.000Z');
    mockLoadCurrentWeekPlan.mockResolvedValue(null);
  });

  it('shows empty state when no plan is stored for the week', async () => {
    mockLoadPlan.mockResolvedValue(null);
    mockLoadCurrentWeekPlan.mockResolvedValue(null);

    const { findByText } = render(
      <PracticePlannerScreen navigation={navigation} route={undefined as any} />,
    );

    expect(await findByText(/No plan yet/i)).toBeTruthy();
  });

  it('renders stored drills and toggles completion', async () => {
    const plan = {
      weekStartISO: '2024-01-01T00:00:00.000Z',
      items: [
        {
          id: 'item-1',
          drillId: 'putting-lag-ladder',
          createdAt: '2024-01-02',
          status: 'planned' as const,
        },
      ],
    };
    mockLoadPlan.mockResolvedValue(plan);
    mockLoadCurrentWeekPlan.mockResolvedValue(plan);
    mockSavePlan.mockResolvedValue(undefined);

    const { findByTestId, getByText } = render(
      <PracticePlannerScreen navigation={navigation} route={undefined as any} />,
    );

    const item = await findByTestId('plan-item-item-1');
    expect(within(item).getByText(/Lag putting ladder/i)).toBeTruthy();

    fireEvent.click(getByText(/Mark done/i));

    await waitFor(() =>
      expect(mockSavePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [expect.objectContaining({ status: 'done' })],
        }),
      ),
    );
  });

  it('navigates to practice journal from header link', async () => {
    mockLoadPlan.mockResolvedValue(null);
    mockLoadCurrentWeekPlan.mockResolvedValue(null);

    const { findByTestId } = render(
      <PracticePlannerScreen navigation={navigation} route={undefined as any} />,
    );

    const history = await findByTestId('practice-planner-history');
    fireEvent.click(history);

    expect(navigation.navigate).toHaveBeenCalledWith('PracticeJournal');
  });

  it('loads a plan from recommended drills and highlights them', async () => {
    mockLoadPlan.mockResolvedValue(null);
    mockFetchPlanFromDrills.mockResolvedValue({
      focusCategories: ['putting'],
      drills: [
        {
          id: 'putting-lag-ladder',
          name: 'Lag ladder',
          description: 'Control distance',
          category: 'putting',
          focusMetric: 'speed',
          difficulty: 'easy',
          durationMinutes: 10,
        },
      ],
    });

    const { findByTestId, getByTestId } = render(
      <PracticePlannerScreen
        navigation={navigation}
        route={{ params: { focusDrillIds: ['putting-lag-ladder'], maxMinutes: 30 } } as any}
      />,
    );

    await waitFor(() =>
      expect(mockFetchPlanFromDrills).toHaveBeenCalledWith({
        drillIds: ['putting-lag-ladder'],
        maxMinutes: 30,
      }),
    );

    expect(await findByTestId('plan-item-putting-lag-ladder-0')).toBeTruthy();
    expect(getByTestId('recommended-putting-lag-ladder')).toBeTruthy();
  });
});
