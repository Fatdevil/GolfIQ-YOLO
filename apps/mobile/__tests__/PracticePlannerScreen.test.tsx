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

const mockLoadPlan = loadPracticePlan as unknown as Mock;
const mockLoadCurrentWeekPlan = loadCurrentWeekPracticePlan as unknown as Mock;
const mockSavePlan = savePracticePlan as unknown as Mock;
const mockGetWeekStartISO = getWeekStartISO as unknown as Mock;

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
});
