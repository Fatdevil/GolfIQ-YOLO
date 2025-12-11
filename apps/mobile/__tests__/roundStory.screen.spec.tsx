import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import RoundStoryScreen from '@app/screens/RoundStoryScreen';
import { loadPracticeMissionHistory } from '@app/storage/practiceMissionHistory';
import { loadWeeklyPracticeGoalSettings } from '@app/storage/practiceGoalSettings';
import { safeEmit } from '@app/telemetry';

vi.mock('@app/api/player', () => ({
  fetchAccessPlan: vi.fn(),
}));

vi.mock('@app/api/roundStory', () => ({
  fetchRoundSg: vi.fn(),
  fetchSessionTimeline: vi.fn(),
  fetchCoachRoundSummary: vi.fn(),
}));
vi.mock('@app/storage/practiceMissionHistory', () => ({
  loadPracticeMissionHistory: vi.fn(),
}));
vi.mock('@app/storage/practiceGoalSettings', () => ({
  loadWeeklyPracticeGoalSettings: vi.fn(),
}));
vi.mock('@app/telemetry', () => ({
  safeEmit: vi.fn(),
}));

const summary = {
  runId: 'run-1',
  courseName: 'Pebble Beach',
  teeName: 'Blue',
  holes: 18,
  totalStrokes: 82,
  relativeToPar: '+10',
  finishedAt: '2024-01-01T00:00:00.000Z',
};

const navigation = { navigate: vi.fn() } as any;

const PRO_TEASER = 'Unlock full analysis (SG and swing insights) with GolfIQ Pro.';

const mockLoadPracticeHistory = loadPracticeMissionHistory as unknown as Mock;
const mockLoadWeeklyPracticeGoalSettings = loadWeeklyPracticeGoalSettings as unknown as Mock;
const mockSafeEmit = safeEmit as unknown as Mock;

describe('RoundStoryScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLoadPracticeHistory.mockResolvedValue([]);
    mockLoadWeeklyPracticeGoalSettings.mockResolvedValue({ targetMissionsPerWeek: 3 });
  });

  it('shows structured analytics for pro users', async () => {
    const { fetchAccessPlan } = await import('@app/api/player');
    const { fetchRoundSg, fetchSessionTimeline, fetchCoachRoundSummary } = await import('@app/api/roundStory');

    vi.mocked(fetchAccessPlan).mockResolvedValue({ plan: 'pro' } as any);
    vi.mocked(fetchRoundSg).mockResolvedValue({
      total: 0.5,
      categories: [
        { name: 'Off tee', strokesGained: 0.2 },
        { name: 'Approach', strokesGained: 0.1 },
        { name: 'Short game', strokesGained: -0.1 },
        { name: 'Putting', strokesGained: 0.3 },
      ],
    });
    vi.mocked(fetchSessionTimeline).mockResolvedValue({ runId: 'run-1', events: [{ ts: 0.2, type: 'peak_hips' }] });
    vi.mocked(fetchCoachRoundSummary).mockResolvedValue({ strengths: ['Driving solid'], focus: ['Putting drills'] });

    render(
      <RoundStoryScreen
        navigation={navigation}
        route={{ key: 'RoundStory', name: 'RoundStory', params: { runId: 'run-1', summary } }}
      />,
    );

    expect(await screen.findByText('Round overview')).toBeInTheDocument();
    expect(await screen.findByTestId('key-stats')).toHaveTextContent('+0.5');
    await waitFor(() => expect(screen.getByTestId('timeline-highlights')).toHaveTextContent('Highlights'));
    expect(await screen.findByText(/Smooth hip speed through the swing/)).toBeInTheDocument();
    expect(screen.getByTestId('coach-insights')).toHaveTextContent('Strengths');
    expect(screen.getByTestId('coach-insights')).toHaveTextContent('Driving solid');
    expect(screen.queryByText(PRO_TEASER)).toBeNull();
  });

  it('shows guided preview for free users with one teaser', async () => {
    const { fetchAccessPlan } = await import('@app/api/player');
    const { fetchRoundSg } = await import('@app/api/roundStory');

    vi.mocked(fetchAccessPlan).mockResolvedValue({ plan: 'free' } as any);
    vi.mocked(fetchRoundSg).mockResolvedValue({
      total: 0,
      categories: [
        { name: 'Off tee', strokesGained: 0.2 },
        { name: 'Approach', strokesGained: 0.1 },
        { name: 'Short game', strokesGained: 0 },
        { name: 'Putting', strokesGained: -0.1 },
      ],
    });

    render(
      <RoundStoryScreen
        navigation={navigation}
        route={{ key: 'RoundStory', name: 'RoundStory', params: { runId: 'run-1', summary } }}
      />,
    );

    expect(await screen.findByText('Key stats')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-highlights')).toHaveTextContent(PRO_TEASER);
    expect(screen.getByTestId('coach-insights')).toHaveTextContent('Quick note');
    expect(screen.queryAllByText(PRO_TEASER)).toHaveLength(1);
  });

  it('surfaces practice readiness summary and emits telemetry', async () => {
    const { fetchAccessPlan } = await import('@app/api/player');
    vi.mocked(fetchAccessPlan).mockResolvedValue({ plan: 'free' } as any);
    mockLoadPracticeHistory.mockResolvedValue([
      {
        id: 'p1',
        missionId: 'mission-1',
        startedAt: new Date().toISOString(),
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 25,
      },
    ]);
    mockLoadWeeklyPracticeGoalSettings.mockResolvedValue({ targetMissionsPerWeek: 1 });

    render(
      <RoundStoryScreen
        navigation={navigation}
        route={{ key: 'RoundStory', name: 'RoundStory', params: { runId: 'run-1', summary } }}
      />,
    );

    const readinessCard = await screen.findByTestId('practice-readiness');
    expect(readinessCard).toHaveTextContent('Practice this week');
    expect(readinessCard).toHaveTextContent('1 practice sessions');
    expect(readinessCard).toHaveTextContent('25 shots logged');

    await waitFor(() => expect(mockSafeEmit).toHaveBeenCalledWith('practice_readiness_viewed', expect.any(Object)));
    const payload = vi.mocked(mockSafeEmit).mock.calls.find(([event]) => event === 'practice_readiness_viewed')?.[1] as
      | any
      | undefined;
    expect(payload?.surface).toBe('round_story');
    expect(payload?.roundId).toBe('run-1');
    expect(payload?.goalReached).toBe(true);
  });

  it('handles partial analytics data safely', async () => {
    const { fetchAccessPlan } = await import('@app/api/player');
    const { fetchRoundSg, fetchSessionTimeline, fetchCoachRoundSummary } = await import('@app/api/roundStory');

    vi.mocked(fetchAccessPlan).mockResolvedValue({ plan: 'pro' } as any);
    vi.mocked(fetchRoundSg).mockResolvedValue({
      total: 1,
      categories: [
        { name: 'Off tee', strokesGained: 0.5 },
        { name: 'Approach', strokesGained: 0.3 },
        { name: 'Short game', strokesGained: 0.2 },
        { name: 'Putting', strokesGained: 0 },
      ],
    });
    vi.mocked(fetchSessionTimeline).mockResolvedValue({ runId: 'run-1', events: [] });
    vi.mocked(fetchCoachRoundSummary).mockResolvedValue(null);

    render(
      <RoundStoryScreen
        navigation={navigation}
        route={{ key: 'RoundStory', name: 'RoundStory', params: { runId: 'run-1', summary } }}
      />,
    );

    expect(await screen.findByText('+1.0')).toBeInTheDocument();
    expect(await screen.findByText('No shot-by-shot highlights available for this round.')).toBeInTheDocument();
    expect(screen.getByTestId('coach-insights')).toHaveTextContent('We couldn’t load detailed coach insights');
  });

  it('shows retry on analysis errors', async () => {
    const { fetchAccessPlan } = await import('@app/api/player');
    const { fetchRoundSg, fetchSessionTimeline, fetchCoachRoundSummary } = await import('@app/api/roundStory');

    vi.mocked(fetchAccessPlan).mockResolvedValue({ plan: 'pro' } as any);
    vi.mocked(fetchRoundSg).mockRejectedValue(new Error('network fail'));
    vi.mocked(fetchSessionTimeline).mockRejectedValue(new Error('network fail'));
    vi.mocked(fetchCoachRoundSummary).mockRejectedValue(new Error('network fail'));

    render(
      <RoundStoryScreen
        navigation={navigation}
        route={{ key: 'RoundStory', name: 'RoundStory', params: { runId: 'run-1', summary } }}
      />,
    );

    expect(await screen.findByText(/We couldn’t load the detailed analysis/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(fetchRoundSg).toHaveBeenCalledTimes(2);
  });
});

