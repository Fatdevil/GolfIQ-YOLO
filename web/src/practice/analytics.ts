import { postTelemetryEvent } from "@/api";
import {
  emitWeeklyPracticeInsightsViewed,
  type WeeklyPracticeInsightsViewedEvent,
} from "@shared/practice/practiceInsightsAnalytics";
import {
  buildPracticeMissionCompleteEvent,
  buildPracticeMissionStartEvent,
  type PracticeMissionCompleteEvent,
  type PracticeMissionStartEvent,
} from "@shared/practice/practiceSessionAnalytics";
import {
  buildWeeklyPracticeGoalSettingsUpdatedEvent,
  buildPracticeGoalNudgeEventPayload,
  type WeeklyPracticeGoalSettingsUpdatedInput,
  type PracticeGoalNudgeContext,
} from "@shared/practice/practiceGoalAnalytics";
import type { PracticeRecommendationContext } from "@shared/practice/practiceRecommendationsAnalytics";
import {
  buildPracticeMissionRecommendationClickedEvent,
  buildPracticeMissionRecommendationShownEvent,
  type PracticeMissionRecommendationClickedEvent,
  type PracticeMissionRecommendationShownEvent,
} from "@shared/practice/practiceRecommendationsAnalytics";

export type PracticeAnalyticsEvent =
  | "practice_missions_viewed"
  | "practice_mission_start"
  | "practice_mission_complete"
  | "practice_quick_session_start"
  | "practice_quick_session_complete"
  | "practice_plan_viewed"
  | "practice_plan_mission_start"
  | "practice_plan_completed_viewed"
  | "practice_goal_settings_updated"
  | "practice_goal_nudge_shown"
  | "practice_goal_nudge_clicked"
  | "weekly_practice_insights_viewed"
  | "practice_weekly_history_viewed"
  | "practice_mission_recommendation_shown"
  | "practice_mission_recommendation_clicked";

export type QuickPracticeEntrySource = "range_home" | "recap" | "missions" | "other";

type MissionViewedEvent = {
  surface: "web";
  source: "home_hub" | "other";
};

type PlanViewedEvent = {
  entryPoint: "practice_missions";
  missionsInPlan: number;
  targetMissionsPerWeek?: number;
};

type PlanCompletedViewedEvent = {
  entryPoint?: "practice_missions" | "home";
  completedMissions: number;
  totalMissions: number;
  isPlanCompleted: boolean;
  targetMissionsPerWeek?: number;
};

type MissionStartEvent = {
  missionId?: string | null;
  sourceSurface: "missions_page" | "range_practice" | "round_recap";
  recommendation?: PracticeRecommendationContext;
};

type PlanMissionStartEvent = {
  entryPoint: "practice_missions";
  missionId: string;
  planRank: number;
};

type MissionCompleteEvent = {
  missionId?: string | null;
  samplesCount?: number | null;
  recommendation?: PracticeRecommendationContext;
};

type QuickPracticeSessionStartEvent = {
  surface: "web";
  entrySource?: QuickPracticeEntrySource;
  hasRecommendation?: boolean;
  targetClubsCount?: number;
};

type QuickPracticeSessionCompleteEvent = {
  surface: "web";
  entrySource?: QuickPracticeEntrySource;
  hasRecommendation?: boolean;
  swingsCount?: number;
  durationSeconds?: number;
};

type WeeklyPracticeHistoryViewedEvent = {
  surface: "web_practice_missions";
  weeks: number;
};

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function emitPracticeAnalytics(event: PracticeAnalyticsEvent, payload: Record<string, unknown>): void {
  try {
    const result = postTelemetryEvent({ event, ...sanitizePayload(payload) });
    if (typeof (result as Promise<unknown>)?.catch === "function") {
      void (result as Promise<unknown>).catch((error) => {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn(`[practice/analytics] failed to emit ${event}`, error);
        }
      });
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[practice/analytics] emitter threw for ${event}`, error);
    }
  }
}

export function trackPracticeMissionsViewed(payload: MissionViewedEvent): void {
  emitPracticeAnalytics("practice_missions_viewed", payload);
}

export function trackPracticeMissionStart(payload: MissionStartEvent): void {
  const event = buildPracticeMissionStartEvent(payload);
  emitPracticeAnalytics("practice_mission_start", event);
}

export function trackPracticePlanViewed(payload: PlanViewedEvent): void {
  emitPracticeAnalytics("practice_plan_viewed", payload);
}

export function trackPracticePlanMissionStart(payload: PlanMissionStartEvent): void {
  emitPracticeAnalytics("practice_plan_mission_start", payload);
}

export function trackPracticePlanCompletedViewed(payload: PlanCompletedViewedEvent): void {
  emitPracticeAnalytics("practice_plan_completed_viewed", {
    ...payload,
    entryPoint: payload.entryPoint ?? "practice_missions",
  });
}

export function trackPracticeMissionComplete(payload: MissionCompleteEvent): void {
  const event = buildPracticeMissionCompleteEvent(payload);
  emitPracticeAnalytics("practice_mission_complete", event);
}

export function trackQuickPracticeSessionStart(payload: QuickPracticeSessionStartEvent): void {
  emitPracticeAnalytics("practice_quick_session_start", payload);
}

export function trackQuickPracticeSessionComplete(payload: QuickPracticeSessionCompleteEvent): void {
  emitPracticeAnalytics("practice_quick_session_complete", payload);
}

export function trackWeeklyPracticeGoalSettingsUpdated(
  payload: WeeklyPracticeGoalSettingsUpdatedInput,
): void {
  const event = buildWeeklyPracticeGoalSettingsUpdatedEvent(payload);
  emitPracticeAnalytics("practice_goal_settings_updated", event);
}

export function trackPracticeGoalNudgeShown(payload: PracticeGoalNudgeContext): void {
  const event = buildPracticeGoalNudgeEventPayload(payload);
  emitPracticeAnalytics("practice_goal_nudge_shown", event);
}

export function trackPracticeGoalNudgeClicked(payload: PracticeGoalNudgeContext): void {
  const event = buildPracticeGoalNudgeEventPayload(payload);
  emitPracticeAnalytics("practice_goal_nudge_clicked", event);
}

export function trackPracticeMissionRecommendationShown(
  payload: PracticeMissionRecommendationShownEvent,
): void {
  const event = buildPracticeMissionRecommendationShownEvent(payload);
  emitPracticeAnalytics("practice_mission_recommendation_shown", event);
}

export function trackPracticeMissionRecommendationClicked(
  payload: PracticeMissionRecommendationClickedEvent,
): void {
  const event = buildPracticeMissionRecommendationClickedEvent(payload);
  emitPracticeAnalytics("practice_mission_recommendation_clicked", event);
}

export function trackWeeklyPracticeInsightsViewed(payload: WeeklyPracticeInsightsViewedEvent): void {
  emitWeeklyPracticeInsightsViewed(
    {
      emit: (event, data) => emitPracticeAnalytics(event as PracticeAnalyticsEvent, data),
    },
    payload,
  );
}

export function trackPracticeWeeklyHistoryViewed(payload: WeeklyPracticeHistoryViewedEvent): void {
  emitPracticeAnalytics("practice_weekly_history_viewed", payload);
}
