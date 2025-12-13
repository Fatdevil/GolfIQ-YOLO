import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import RoundStoryScreen from '@app/screens/RoundStoryScreen';
import { fetchRoundRecap } from '@app/api/roundClient';
import { loadPracticeMissionHistory } from '@app/storage/practiceMissionHistory';
import { loadWeeklyPracticeGoalSettings } from '@app/storage/practiceGoalSettings';
import { safeEmit } from '@app/telemetry';
import { t } from '@app/i18n';

vi.mock('@app/api/player', () => ({
  fetchAccessPlan: vi.fn(),
}));

vi.mock('@app/api/roundStory', () => ({
  fetchRoundSg: vi.fn(),
  fetchSessionTimeline: vi.fn(),
  fetchCoachRoundSummary: vi.fn(),
}));
vi.mock('@app/api/roundClient', () => ({
  fetchRoundRecap: vi.fn(),
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
const mockFetchRoundRecap = fetchRoundRecap as unknown as Mock;

describe('RoundStoryScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLoadPracticeHistory.mockResolvedValue([]);
    mockLoadWeeklyPracticeGoalSettings.mockResolvedValue({ targetMissionsPerWeek: 3 });
    mockFetchRoundRecap.mockResolvedValue({ strokesGainedLightTrend: null } as any);
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

  it('renders SG Light trend when data is present', async () => {
    const { fetchAccessPlan } = await import('@app/api/player');
    const { fetchRoundSg } = await import('@app/api/roundStory');

    vi.mocked(fetchAccessPlan).mockResolvedValue({ plan: 'free' } as any);
    vi.mocked(fetchRoundSg).mockResolvedValue({
      total: 0,
      categories: [
        { name: 'Off tee', strokesGained: 0.1 },
        { name: 'Approach', strokesGained: 0.1 },
        { name: 'Short game', strokesGained: 0 },
        { name: 'Putting', strokesGained: 0 },
      ],
    });
    mockFetchRoundRecap.mockResolvedValue({
      strokesGainedLightTrend: {
        windowSize: 3,
        perCategory: {
          tee: { avgDelta: 0.8, rounds: 3 },
          approach: { avgDelta: -0.4, rounds: 3 },
          short_game: { avgDelta: 0.2, rounds: 3 },
          putting: { avgDelta: 0.1, rounds: 3 },
        },
        focusHistory: [
          { roundId: 'r1', playedAt: '2024-01-01', focusCategory: 'approach' },
          { roundId: 'r0', playedAt: '2023-12-20', focusCategory: 'tee' },
        ],
      },
    } as any);

    render(
      <RoundStoryScreen
        navigation={navigation}
        route={{ key: 'RoundStory', name: 'RoundStory', params: { runId: 'run-1', summary } }}
      />,
    );

    const trendCard = await screen.findByTestId('sg-light-trend');
    expect(trendCard).toHaveTextContent(t('round.story.sgLightTrendTitle'));
    expect(trendCard).toHaveTextContent(t('round.story.sgLightTrendSubtitle', { rounds: 3 }));
    expect(trendCard).toHaveTextContent(t('round.story.sgLightTrendCategory.approach'));
    expect(trendCard).toHaveTextContent('+0.8');
    await waitFor(() => expect(mockSafeEmit).toHaveBeenCalledWith('sg_light_trend_viewed', expect.any(Object)));
  });

  it('dedupes SG Light trend impressions across rerenders and new contexts', async () => {
    const { fetchAccessPlan } = await import('@app/api/player');
    const { fetchRoundSg, fetchSessionTimeline, fetchCoachRoundSummary } = await import('@app/api/roundStory');

    vi.mocked(fetchAccessPlan).mockResolvedValue({ plan: 'free' } as any);
    vi.mocked(fetchRoundSg).mockResolvedValue({ total: 0, categories: [] });
    vi.mocked(fetchSessionTimeline).mockResolvedValue({ runId: 'run-1', events: [] });
    vi.mocked(fetchCoachRoundSummary).mockResolvedValue({ strengths: [], focus: [] });
    mockFetchRoundRecap.mockResolvedValue({
      strokesGainedLightTrend: {
        windowSize: 3,
        perCategory: { tee: { avgDelta: 0.1, rounds: 3 }, approach: { avgDelta: -0.2, rounds: 3 } },
        focusHistory: [{ roundId: 'run-1', playedAt: '2024-02-01', focusCategory: 'approach' }],
      },
    } as any);

    const { rerender } = render(
      <RoundStoryScreen
        navigation={navigation}
        route={{ key: 'RoundStory', name: 'RoundStory', params: { runId: 'run-1', summary } }}
      />,
    );

    await waitFor(() => expect(mockSafeEmit).toHaveBeenCalledWith('sg_light_trend_viewed', expect.any(Object)));
    const trendCalls = () => vi.mocked(mockSafeEmit).mock.calls.filter(([event]) => event === 'sg_light_trend_viewed');
    expect(trendCalls()).toHaveLength(1);

    rerender(
      <RoundStoryScreen
        navigation={navigation}
        route={{ key: 'RoundStory', name: 'RoundStory', params: { runId: 'run-1', summary } }}
      />,
    );

    await waitFor(() => expect(trendCalls()).toHaveLength(1));

    mockFetchRoundRecap.mockResolvedValueOnce({
      strokesGainedLightTrend: {
        windowSize: 3,
        perCategory: { tee: { avgDelta: 0.2, rounds: 3 }, approach: { avgDelta: -0.1, rounds: 3 } },
        focusHistory: [{ roundId: 'run-2', playedAt: '2024-03-01', focusCategory: 'tee' }],
      },
    } as any);

    rerender(
      <RoundStoryScreen
        navigation={navigation}
        route={{ key: 'RoundStory', name: 'RoundStory', params: { runId: 'run-2', summary: { ...summary, runId: 'run-2' } } }}
      />,
    );

    await waitFor(() => expect(trendCalls()).toHaveLength(2));
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

  it('shows fallback when SG Light trend is missing', async () => {
    const { fetchAccessPlan } = await import('@app/api/player');
    const { fetchRoundSg } = await import('@app/api/roundStory');

    vi.mocked(fetchAccessPlan).mockResolvedValue({ plan: 'free' } as any);
    vi.mocked(fetchRoundSg).mockResolvedValue({
      total: 0,
      categories: [
        { name: 'Off tee', strokesGained: 0 },
        { name: 'Approach', strokesGained: 0 },
        { name: 'Short game', strokesGained: 0 },
        { name: 'Putting', strokesGained: 0 },
      ],
    });
    mockFetchRoundRecap.mockResolvedValue({ strokesGainedLightTrend: null } as any);

    render(
      <RoundStoryScreen
        navigation={navigation}
        route={{ key: 'RoundStory', name: 'RoundStory', params: { runId: 'run-1', summary } }}
      />,
    );

    const trendCard = await screen.findByTestId('sg-light-trend');
    expect(trendCard).toHaveTextContent(t('weeklySummary.notEnough'));
  });

  it('opens SG Light explainer from trend card', async () => {
    const { fetchAccessPlan } = await import('@app/api/player');
    const { fetchRoundSg, fetchSessionTimeline, fetchCoachRoundSummary } = await import('@app/api/roundStory');
    const sgLightTrend = {
      windowSize: 3,
      perCategory: {
        tee: { avgDelta: 0.2, rounds: 3 },
        approach: { avgDelta: -0.1, rounds: 3 },
        short_game: { avgDelta: 0.0, rounds: 3 },
        putting: { avgDelta: 0.1, rounds: 3 },
      },
      focusHistory: [{ roundId: 'run-1', playedAt: '2024-01-01', focusCategory: 'tee' }],
    };

    vi.mocked(fetchAccessPlan).mockResolvedValue({ plan: 'pro' } as any);
    vi.mocked(fetchRoundSg).mockResolvedValue({ total: 0, categories: [] });
    vi.mocked(fetchSessionTimeline).mockResolvedValue({ runId: 'run-1', events: [] });
    vi.mocked(fetchCoachRoundSummary).mockResolvedValue({ strengths: [], focus: [] });
    mockFetchRoundRecap.mockResolvedValue({ strokesGainedLightTrend: sgLightTrend } as any);

    const { getByTestId, getByText } = render(
      <RoundStoryScreen navigation={navigation} route={{ key: 'RoundStory', name: 'RoundStory', params: { runId: 'run-1' } }} />,
    );

    await waitFor(() => expect(getByTestId('sg-light-trend')).toBeTruthy());
    fireEvent.click(getByTestId('open-sg-light-explainer'));

    expect(getByText('What is SG Light?')).toBeTruthy();
    expect(mockSafeEmit).toHaveBeenCalledWith('sg_light_explainer_opened', {
      surface: 'round_story',
      roundId: 'run-1',
    });
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
    expect(await screen.findByText(t('round.story.highlightsUnavailable'))).toBeInTheDocument();
    expect(screen.getByTestId('coach-insights')).toHaveTextContent(t('round.story.coachInsightsUnavailable'));
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

