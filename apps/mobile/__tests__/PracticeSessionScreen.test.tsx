import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import PracticeSessionScreen from '@app/screens/PracticeSessionScreen';
import {
  loadCurrentWeekPracticePlan,
  loadPracticePlan,
  savePracticePlan,
} from '@app/practice/practicePlanStorage';
import { savePracticeSession } from '@app/practice/practiceSessionStorage';

vi.mock('@app/practice/practicePlanStorage', () => ({
  loadCurrentWeekPracticePlan: vi.fn(),
  loadPracticePlan: vi.fn(),
  savePracticePlan: vi.fn(),
  serializePracticePlanWrite: (op: () => Promise<unknown> | unknown) => Promise.resolve(op()).then((v) => v as any),
  getWeekStartISO: () => '2024-01-01T00:00:00.000Z',
}));

vi.mock('@app/practice/practiceSessionStorage', () => ({
  savePracticeSession: vi.fn(),
}));

const mockLoadCurrentPlan = loadCurrentWeekPracticePlan as unknown as Mock;
const mockLoadPlan = loadPracticePlan as unknown as Mock;
const mockSavePlan = savePracticePlan as unknown as Mock;
const mockSaveSession = savePracticeSession as unknown as Mock;

const navigation = { navigate: vi.fn() } as any;

const plan = {
  weekStartISO: '2024-01-01T00:00:00.000Z',
  items: [
    { id: 'item-1', drillId: 'putting-lag-ladder', createdAt: '2024-01-02', status: 'planned' as const },
    { id: 'item-2', drillId: 'approach-start-line', createdAt: '2024-01-02', status: 'planned' as const },
  ],
};

describe('PracticeSessionScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadCurrentPlan.mockResolvedValue(plan);
    mockLoadPlan.mockResolvedValue(plan);
    mockSavePlan.mockResolvedValue(undefined);
  });

  it('shows empty state when no drills exist', async () => {
    mockLoadCurrentPlan.mockResolvedValue(null);

    const { findByTestId, findByText } = render(
      <PracticeSessionScreen navigation={navigation} route={undefined as any} />,
    );

    expect(await findByTestId('practice-session-empty')).toBeTruthy();
    expect(await findByText(/No drills in your plan yet/i)).toBeTruthy();
  });

  it('renders first drill and progress', async () => {
    const { findByTestId, getByText } = render(
      <PracticeSessionScreen navigation={navigation} route={undefined as any} />,
    );

    const drillCard = await findByTestId('session-drill-item-1');
    expect(drillCard).toBeTruthy();
    expect(getByText(/Drill 1 of 2/i)).toBeTruthy();
  });

  it('marks a drill done and advances', async () => {
    const { findByTestId, getByTestId, findByText } = render(
      <PracticeSessionScreen navigation={navigation} route={undefined as any} />,
    );

    await findByTestId('session-drill-item-1');
    fireEvent.click(getByTestId('session-done'));

    await waitFor(() => expect(mockSavePlan).toHaveBeenCalled());
    await findByTestId('session-drill-item-2');
    expect(await findByText(/Drill 2 of 2/i)).toBeTruthy();
  });

  it('shows recap and stores last session when finished', async () => {
    const { getByTestId, findByTestId } = render(
      <PracticeSessionScreen navigation={navigation} route={undefined as any} />,
    );

    await findByTestId('session-drill-item-1');
    fireEvent.click(getByTestId('session-done'));
    await findByTestId('session-drill-item-2');
    fireEvent.click(getByTestId('session-done'));

    await waitFor(() => expect(mockSaveSession).toHaveBeenCalled());
    expect(await findByTestId('practice-session-recap')).toBeTruthy();
  });
});
