import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { Share } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PracticeWeeklySummaryScreen from '@app/screens/PracticeWeeklySummaryScreen';
import { loadCurrentWeekPracticePlan } from '@app/practice/practicePlanStorage';
import { loadPracticeSessions, type PracticeSession } from '@app/practice/practiceSessionStorage';
import {
  logPracticeWeeklySummaryShare,
  logPracticeWeeklySummaryStartPractice,
  logPracticeWeeklySummaryViewed,
} from '@app/analytics/practiceWeeklySummary';

vi.mock('@app/practice/practiceSessionStorage', () => ({
  loadPracticeSessions: vi.fn(),
}));

vi.mock('@app/practice/practicePlanStorage', () => ({
  loadCurrentWeekPracticePlan: vi.fn(),
  getWeekStart: (date = new Date()) => {
    const start = new Date(date);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + diff);
    return start;
  },
}));

vi.mock('@app/analytics/practiceWeeklySummary', () => ({
  logPracticeWeeklySummaryShare: vi.fn(),
  logPracticeWeeklySummaryStartPractice: vi.fn(),
  logPracticeWeeklySummaryViewed: vi.fn(),
}));

const mockLoadSessions = vi.mocked(loadPracticeSessions);
const mockLoadPlan = vi.mocked(loadCurrentWeekPracticePlan);
const navigation = { navigate: vi.fn() } as any;

let session: PracticeSession;
let plan: { weekStartISO: string; items: { id: string; drillId: string; createdAt: string; status: 'done' | 'planned' }[] };

function getCurrentWeekStartISO(now: Date): string {
  const start = new Date(now);
  const diff = start.getDay() === 0 ? -6 : 1 - start.getDay();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + diff);
  return start.toISOString();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  const now = new Date();
  const weekStartISO = getCurrentWeekStartISO(now);
  const start = new Date(now);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  session = {
    id: 'session-1',
    weekStartISO,
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    drillIds: ['a', 'b'],
    completedDrillIds: ['a', 'b'],
    skippedDrillIds: [],
  };
  plan = {
    weekStartISO,
    items: [
      { id: '1', drillId: 'a', createdAt: weekStartISO, status: 'done' },
      { id: '2', drillId: 'b', createdAt: weekStartISO, status: 'planned' },
    ],
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PracticeWeeklySummaryScreen', () => {
  it('renders weekly totals and plan progress', async () => {
    mockLoadSessions.mockResolvedValue([session]);
    mockLoadPlan.mockResolvedValue(plan as any);

    render(
      <PracticeWeeklySummaryScreen
        navigation={navigation}
        route={{ key: 'PracticeWeeklySummary', name: 'PracticeWeeklySummary', params: { source: 'home' } } as any}
      />,
    );

    expect(await screen.findByTestId('practice-weekly-sessions')).toHaveTextContent('1 sessions');
    expect(screen.getByTestId('practice-weekly-drills')).toHaveTextContent('2 drills');
    expect(screen.getByTestId('practice-weekly-plan-progress')).toHaveTextContent('50% of weekly plan');
    await waitFor(() => {
      expect(logPracticeWeeklySummaryViewed).toHaveBeenCalled();
    });
  });

  it('shares the weekly summary text', async () => {
    mockLoadSessions.mockResolvedValue([session]);
    mockLoadPlan.mockResolvedValue(plan as any);

    render(
      <PracticeWeeklySummaryScreen
        navigation={navigation}
        route={{ key: 'PracticeWeeklySummary', name: 'PracticeWeeklySummary', params: { source: 'journal' } } as any}
      />,
    );

    fireEvent.click(await screen.findByTestId('practice-weekly-share'));

    await waitFor(() => {
      expect(Share.share).toHaveBeenCalled();
      expect(logPracticeWeeklySummaryShare).toHaveBeenCalled();
    });

    const message = vi.mocked(Share.share).mock.calls[0]?.[0]?.message;
    expect(message).toContain('This week:');
    expect(message).toContain('streak');
  });

  it('starts practice from CTA', async () => {
    mockLoadSessions.mockResolvedValue([session]);
    mockLoadPlan.mockResolvedValue(plan as any);

    render(
      <PracticeWeeklySummaryScreen
        navigation={navigation}
        route={{ key: 'PracticeWeeklySummary', name: 'PracticeWeeklySummary', params: undefined } as any}
      />,
    );

    fireEvent.click(await screen.findByTestId('practice-weekly-start'));

    await waitFor(() => {
      expect(logPracticeWeeklySummaryStartPractice).toHaveBeenCalled();
      expect(navigation.navigate).toHaveBeenCalledWith('PracticeSession');
    });
  });
});
