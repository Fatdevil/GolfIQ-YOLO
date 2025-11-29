import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RoundStoryScreen from '@app/screens/RoundStoryScreen';

vi.mock('@app/api/player', () => ({
  fetchAccessPlan: vi.fn(),
}));

vi.mock('@app/api/roundStory', () => ({
  fetchRoundSg: vi.fn(),
  fetchSessionTimeline: vi.fn(),
  fetchCoachRoundSummary: vi.fn(),
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

describe('RoundStoryScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows analytics for pro users', async () => {
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
    vi.mocked(fetchCoachRoundSummary).mockResolvedValue({ strengths: ['Driving'], focus: ['Putting drills'] });

    render(<RoundStoryScreen navigation={navigation} route={{ key: 'RoundStory', name: 'RoundStory', params: { runId: 'run-1', summary } }} />);

    expect(await screen.findByText('Strokes gained')).toBeInTheDocument();
    expect(screen.getByTestId('sg-summary')).toHaveTextContent('+0.5');
    await waitFor(() => expect(screen.getByTestId('timeline-highlights')).toBeInTheDocument());
    expect(await screen.findByText(/Hips peak/)).toBeInTheDocument();
    expect(screen.getByTestId('coach-insights')).toHaveTextContent('Driving');
    expect(screen.getByTestId('coach-insights')).toHaveTextContent('Putting drills');
  });

  it('shows pro preview for free users', async () => {
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

    render(<RoundStoryScreen navigation={navigation} route={{ key: 'RoundStory', name: 'RoundStory', params: { runId: 'run-1', summary } }} />);

    expect(await screen.findByTestId('sg-preview-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-highlights')).toBeNull();
    expect(screen.queryByTestId('coach-insights')).toBeNull();
  });
});

