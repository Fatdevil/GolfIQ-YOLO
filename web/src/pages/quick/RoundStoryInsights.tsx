import React, { useMemo } from "react";

import { SgLightInsightsSectionWeb } from "@/sg/SgLightInsightsSectionWeb";
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
      <SgLightInsightsSectionWeb
        surface="round_story"
        contextId={roundId ?? undefined}
        sgLightSummary={summary}
        sgLightTrend={trend}
        rounds={rounds ?? null}
        practiceHrefBuilder={practiceHrefBuilder}
      />
    </section>
  );
}

