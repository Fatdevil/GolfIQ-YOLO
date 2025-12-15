import type {
  PracticeMissionRecommendationClickedEvent,
  PracticeMissionRecommendationReason,
  PracticeMissionRecommendationSurface,
} from "@shared/practice/practiceRecommendationsAnalytics";
import type {
  StrokesGainedLightCategory,
  StrokesGainedLightTrend,
} from "@shared/stats/strokesGainedLight";

export const SG_LIGHT_EXPLAINER_OPENED_EVENT = "sg_light_explainer_opened" as const;
export const SG_LIGHT_PRACTICE_FOCUS_ENTRY_CLICKED_EVENT = "practice_focus_entry_clicked" as const;
export const SG_LIGHT_PRACTICE_FOCUS_ENTRY_SHOWN_EVENT = "practice_focus_entry_shown" as const;
export const SG_LIGHT_PRACTICE_RECOMMENDATION_CLICKED_EVENT = "practice_mission_recommendation_clicked" as const;
export const SG_LIGHT_TREND_VIEWED_EVENT = "sg_light_trend_viewed" as const;

export const SG_LIGHT_PRIMARY_SURFACES = [
  "round_recap",
  "round_story",
  "round_share",
  "player_stats",
] as const;

export const SG_LIGHT_PRACTICE_SURFACES = ["web_round_recap", "web_round_story", "web_round_share"] as const;

export type SgLightSurface = (typeof SG_LIGHT_PRIMARY_SURFACES)[number];
export type SgLightPracticeSurface = (typeof SG_LIGHT_PRACTICE_SURFACES)[number];
export type SgLightAnalyticsSurface = SgLightSurface | SgLightPracticeSurface;

export type SgLightCardType = "summary" | "trend";

export type SgLightAnalyticsContext = {
  surface: SgLightAnalyticsSurface;
  contextId?: string | null;
  focusCategory?: StrokesGainedLightCategory | null;
};

export function buildSgLightSummaryViewedPayload(
  context: SgLightAnalyticsContext,
): { impressionKey: string } {
  return {
    impressionKey: buildSgLightImpressionKey({
      ...context,
      cardType: "summary",
    }),
  };
}

export function buildSgLightImpressionKey({
  surface,
  contextId,
  focusCategory,
  cardType,
}: SgLightAnalyticsContext & { cardType: SgLightCardType }): string {
  const resolvedContext = contextId ?? "unknown";
  let key = `sg_light:${surface}:${resolvedContext}:${cardType}`;

  if (cardType === "trend" && focusCategory) {
    key = `${key}:${focusCategory}`;
  }

  return key;
}

export function buildSgLightExplainerOpenedPayload({
  surface,
  contextId,
}: {
  surface: SgLightSurface;
  contextId?: string | null;
}): { surface: SgLightSurface; roundId?: string } {
  if (surface === "player_stats" || !contextId) {
    return { surface };
  }

  return { surface, roundId: contextId };
}

export const buildSgLightExplainerPayload = buildSgLightExplainerOpenedPayload;

export type SgLightPracticeCtaSurface = SgLightAnalyticsSurface | PracticeMissionRecommendationSurface;

export type SgLightPracticeCtaFocusPayload = {
  surface: SgLightPracticeCtaSurface;
  focusCategory: StrokesGainedLightCategory;
};

export type SgLightPracticeCtaClickedPayload =
  | SgLightPracticeCtaFocusPayload
  | PracticeMissionRecommendationClickedEvent;

export function buildSgLightPracticeCtaClickedPayload(
  payload: PracticeMissionRecommendationClickedEvent,
): PracticeMissionRecommendationClickedEvent;
export function buildSgLightPracticeCtaClickedPayload(
  payload: SgLightPracticeCtaFocusPayload,
): SgLightPracticeCtaFocusPayload;
export function buildSgLightPracticeCtaClickedPayload(
  payload: SgLightPracticeCtaClickedPayload,
): SgLightPracticeCtaClickedPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as SgLightPracticeCtaClickedPayload;
}

export type SgLightTrendViewedPayload = {
  surface: SgLightSurface;
  platform: "mobile" | "web";
  roundId?: string | null;
  windowSize: number;
  focusCategory: StrokesGainedLightTrend["focusHistory"][number]["focusCategory"];
};

export function buildSgLightTrendViewedPayload({
  surface,
  platform,
  roundId,
  trend,
  focusCategory,
}: {
  surface: SgLightSurface;
  platform: "mobile" | "web";
  roundId?: string | null;
  trend: StrokesGainedLightTrend;
  focusCategory: StrokesGainedLightTrend["focusHistory"][number]["focusCategory"];
}): SgLightTrendViewedPayload {
  return {
    surface,
    platform,
    roundId,
    windowSize: trend.windowSize,
    focusCategory,
  };
}
