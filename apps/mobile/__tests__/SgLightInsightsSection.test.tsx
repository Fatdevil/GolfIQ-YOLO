import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SgLightInsightsSection } from '@app/components/sg/SgLightInsightsSection';
import { safeEmit } from '@app/telemetry';
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
  let originalFlag: string | undefined;

  beforeEach(() => {
    originalFlag = process.env.EXPO_PUBLIC_FEATURE_SG_LIGHT;
    process.env.EXPO_PUBLIC_FEATURE_SG_LIGHT = '1';
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (originalFlag === undefined) {
      delete process.env.EXPO_PUBLIC_FEATURE_SG_LIGHT;
    } else {
      process.env.EXPO_PUBLIC_FEATURE_SG_LIGHT = originalFlag;
    }
  });

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

  it('does not render or track when the feature flag is disabled', () => {
    process.env.EXPO_PUBLIC_FEATURE_SG_LIGHT = '0';

    const trackSummary = vi.fn();
    const trackTrend = vi.fn();

    const { queryByTestId } = render(
      <SgLightInsightsSection
        surface="round_story"
        contextId="ctx-flag"
        summary={summary}
        trend={trend}
        onTrackSummaryImpression={trackSummary}
        onTrackTrendImpression={trackTrend}
      />,
    );

    expect(queryByTestId('sg-light-card')).toBeNull();
    expect(trackSummary).not.toHaveBeenCalled();
    expect(trackTrend).not.toHaveBeenCalled();
    expect(safeEmit).not.toHaveBeenCalled();
  });
});
