import React, { useMemo } from "react";

import { SgLightSummaryCardWeb } from "@/sg/SgLightSummaryCardWeb";
import { SgLightTrendCardWeb } from "@/sg/SgLightTrendCardWeb";
import type {
  StrokesGainedLightCategory,
  StrokesGainedLightSummary,
  StrokesGainedLightTrend,
} from "@shared/stats/strokesGainedLight";

type Props = {
  summary?: StrokesGainedLightSummary | null;
  trend?: StrokesGainedLightTrend | null;
  rounds?: Array<
    StrokesGainedLightSummary & { roundId?: string; playedAt?: string }
  > | null;
  roundId?: string | null;
  practiceHrefBuilder?(focusCategory: StrokesGainedLightCategory): string | null;
};

export function RoundStoryInsights({
  summary,
  trend,
  rounds,
  roundId,
  practiceHrefBuilder,
}: Props): JSX.Element | null {
  const hasSummary = Boolean(summary);
  const hasTrend = Boolean(trend || rounds?.length);

  const showContent = useMemo(() => hasSummary || hasTrend, [hasSummary, hasTrend]);

  if (!showContent) return null;

  return (
    <section className="space-y-3" data-testid="round-story-sg-light">
      {hasSummary ? (
        <SgLightSummaryCardWeb
          summary={summary ?? null}
          practiceSurface="web_round_story"
          practiceHrefBuilder={practiceHrefBuilder}
          explainerSurface="round_story"
          roundId={roundId}
        />
      ) : null}
      {hasTrend ? (
        <SgLightTrendCardWeb
          rounds={rounds ?? undefined}
          trend={trend ?? undefined}
          practiceSurface="web_round_story"
          practiceHrefBuilder={practiceHrefBuilder}
          roundId={roundId}
        />
      ) : null}
    </section>
  );
}

