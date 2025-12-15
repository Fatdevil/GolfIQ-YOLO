import {
  buildPracticeMissionRecommendationClickedEvent,
  type PracticeMissionRecommendationClickedEvent,
  type PracticeMissionRecommendationReason,
  type PracticeMissionRecommendationSurface,
} from "@shared/practice/practiceRecommendationsAnalytics";
import type {
  StrokesGainedLightCategory,
  StrokesGainedLightTrend,
} from "@shared/stats/strokesGainedLight";

export const SG_LIGHT_EXPLAINER_OPENED_EVENT = "sg_light_explainer_opened" as const;
export const SG_LIGHT_SUMMARY_VIEWED_EVENT = "sg_light_summary_viewed" as const;
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

export function buildSgLightSummaryImpressionTelemetry(
  context: SgLightAnalyticsContext,
): { eventName: typeof SG_LIGHT_SUMMARY_VIEWED_EVENT; payload: { impressionKey: string } } {
  return {
    eventName: SG_LIGHT_SUMMARY_VIEWED_EVENT,
    payload: buildSgLightSummaryViewedPayload(context),
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

export function buildSgLightExplainerOpenTelemetry({
  surface,
  contextId,
}: {
  surface: SgLightSurface;
  contextId?: string | null;
}): { eventName: typeof SG_LIGHT_EXPLAINER_OPENED_EVENT; payload: ReturnType<typeof buildSgLightExplainerOpenedPayload> } {
  return {
    eventName: SG_LIGHT_EXPLAINER_OPENED_EVENT,
    payload: buildSgLightExplainerOpenedPayload({ surface, contextId }),
  };
}

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

export function buildSgLightPracticeCtaClickTelemetry(
  payload: SgLightPracticeCtaClickedPayload,
):
  | {
      eventName: typeof SG_LIGHT_PRACTICE_FOCUS_ENTRY_CLICKED_EVENT;
      payload: SgLightPracticeCtaFocusPayload;
    }
  | {
      eventName: typeof SG_LIGHT_PRACTICE_RECOMMENDATION_CLICKED_EVENT;
      payload: PracticeMissionRecommendationClickedEvent;
    } {
  if ("missionId" in payload) {
    return {
      eventName: SG_LIGHT_PRACTICE_RECOMMENDATION_CLICKED_EVENT,
      payload: buildPracticeMissionRecommendationClickedEvent(payload),
    };
  }

  return {
    eventName: SG_LIGHT_PRACTICE_FOCUS_ENTRY_CLICKED_EVENT,
    payload: buildSgLightPracticeCtaClickedPayload(payload),
  };
}

export function buildSgLightPracticeFocusEntryShownTelemetry({
  surface,
  focusCategory,
}: {
  surface: string;
  focusCategory: StrokesGainedLightCategory;
}): {
  eventName: typeof SG_LIGHT_PRACTICE_FOCUS_ENTRY_SHOWN_EVENT;
  payload: { surface: string; focusCategory: StrokesGainedLightCategory };
} {
  return {
    eventName: SG_LIGHT_PRACTICE_FOCUS_ENTRY_SHOWN_EVENT,
    payload: { surface, focusCategory },
  };
}

export function buildSgLightPracticeFocusEntryImpressionDedupeKey({
  surface,
  missionId,
  entryPoint,
  focusArea,
}: {
  surface: string;
  missionId?: string | null;
  entryPoint?: string | null;
  focusArea?: string | null;
}): string {
  const resolvedMission = missionId ?? "unknown";
  const resolvedEntryPoint = entryPoint ?? "unknown";
  const resolvedFocusArea = focusArea ?? "unknown";

  return `sg_light:practice_focus_entry:${surface}:${resolvedMission}:${resolvedEntryPoint}:${resolvedFocusArea}`;
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

export function buildSgLightTrendImpressionTelemetry({
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
  focusCategory: SgLightTrendViewedPayload["focusCategory"];
}): { eventName: typeof SG_LIGHT_TREND_VIEWED_EVENT; payload: SgLightTrendViewedPayload } {
  return {
    eventName: SG_LIGHT_TREND_VIEWED_EVENT,
    payload: buildSgLightTrendViewedPayload({
      surface,
      platform,
      roundId,
      trend,
      focusCategory,
    }),
  };
}
