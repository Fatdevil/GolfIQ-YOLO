import { postTelemetryEvent } from "@/api";

export type PracticeAnalyticsEvent =
  | "practice_missions_viewed"
  | "practice_mission_start"
  | "practice_mission_complete";

type MissionViewedEvent = {
  surface: "web";
  source: "home_hub" | "other";
};

type MissionStartEvent = {
  missionId?: string | null;
  sourceSurface: "missions_page" | "range_practice" | "round_recap";
};

type MissionCompleteEvent = {
  missionId?: string | null;
  samplesCount?: number | null;
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
  emitPracticeAnalytics("practice_mission_start", payload);
}

export function trackPracticeMissionComplete(payload: MissionCompleteEvent): void {
  emitPracticeAnalytics("practice_mission_complete", payload);
}
