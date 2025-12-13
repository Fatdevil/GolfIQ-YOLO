import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';

import { SgLightInsightsSection } from '@app/components/sg/SgLightInsightsSection';
import type {
  StrokesGainedLightSummary,
  StrokesGainedLightTrend,
} from '@shared/stats/strokesGainedLight';

vi.mock('@app/telemetry', () => ({ safeEmit: vi.fn() }));

const summary: StrokesGainedLightSummary = {
  totalDelta: 0.4,
  byCategory: [{ category: 'tee' as const, shots: 8, delta: 0.4, confidence: 1 }],
  focusCategory: 'tee',
};

const trend: StrokesGainedLightTrend = {
  windowSize: 5,
  perCategory: {
    tee: { avgDelta: 0.2, rounds: 2 },
    approach: { avgDelta: 0.1, rounds: 2 },
    short_game: { avgDelta: -0.1, rounds: 2 },
    putting: { avgDelta: 0, rounds: 2 },
  },
  focusHistory: [
    { focusCategory: 'tee', roundId: 'r-1', playedAt: '2024-01-01' },
    { focusCategory: 'approach', roundId: 'r-0', playedAt: '2023-12-10' },
  ],
};

describe('SgLightInsightsSection', () => {
  it('fires impressions once per card per context across rerenders', async () => {
    const trackSummary = vi.fn();
    const trackTrend = vi.fn();

    const { rerender } = render(
      <SgLightInsightsSection
        surface="player_stats"
        contextId="ctx-1"
        summary={summary}
        trend={trend}
        onTrackSummaryImpression={trackSummary}
        onTrackTrendImpression={trackTrend}
      />,
    );

    await waitFor(() => {
      expect(trackSummary).toHaveBeenCalledTimes(1);
      expect(trackTrend).toHaveBeenCalledTimes(1);
    });

    rerender(
      <SgLightInsightsSection
        surface="player_stats"
        contextId="ctx-1"
        summary={summary}
        trend={trend}
        onTrackSummaryImpression={trackSummary}
        onTrackTrendImpression={trackTrend}
      />,
    );

    await waitFor(() => {
      expect(trackSummary).toHaveBeenCalledTimes(1);
      expect(trackTrend).toHaveBeenCalledTimes(1);
    });

    rerender(
      <SgLightInsightsSection
        surface="player_stats"
        contextId="ctx-2"
        summary={summary}
        trend={trend}
        onTrackSummaryImpression={trackSummary}
        onTrackTrendImpression={trackTrend}
      />,
    );

    await waitFor(() => {
      expect(trackSummary).toHaveBeenCalledTimes(2);
      expect(trackTrend).toHaveBeenCalledTimes(2);
    });
  });
});
