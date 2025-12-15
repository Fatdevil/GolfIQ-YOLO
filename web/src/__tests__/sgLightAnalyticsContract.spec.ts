import { describe, expect, it } from "vitest";

import {
  buildSgLightExplainerOpenTelemetry,
  buildSgLightExplainerOpenedPayload,
  buildSgLightImpressionKey,
  buildSgLightPracticeCtaClickTelemetry,
  buildSgLightPracticeCtaClickedPayload,
  buildSgLightPracticeFocusEntryShownTelemetry,
  buildSgLightSummaryImpressionTelemetry,
  buildSgLightSummaryViewedPayload,
  buildSgLightTrendImpressionTelemetry,
  SG_LIGHT_EXPLAINER_OPENED_EVENT,
  SG_LIGHT_PRACTICE_FOCUS_ENTRY_SHOWN_EVENT,
  SG_LIGHT_PRACTICE_RECOMMENDATION_CLICKED_EVENT,
  SG_LIGHT_SUMMARY_VIEWED_EVENT,
  SG_LIGHT_TREND_VIEWED_EVENT,
  type SgLightPracticeCtaClickedPayload,
} from "@shared/sgLight/analytics";

describe("sg light analytics contract", () => {
  it("builds round recap summary keys", () => {
    expect(
      buildSgLightImpressionKey({
        surface: "round_recap",
        contextId: "round-123",
        cardType: "summary",
      }),
    ).toBe("sg_light:round_recap:round-123:summary");

    expect(
      buildSgLightSummaryViewedPayload({
        surface: "round_recap",
        contextId: "round-123",
      }),
    ).toEqual({ impressionKey: "sg_light:round_recap:round-123:summary" });
  });

  it("pairs summary impression telemetry with the locked event name", () => {
    expect(
      buildSgLightSummaryImpressionTelemetry({ surface: "round_recap", contextId: "round-123" }),
    ).toEqual({
      eventName: SG_LIGHT_SUMMARY_VIEWED_EVENT,
      payload: { impressionKey: "sg_light:round_recap:round-123:summary" },
    });
  });

  it("builds round story trend keys with and without focus", () => {
    expect(
      buildSgLightImpressionKey({
        surface: "round_story",
        contextId: "story-456",
        cardType: "trend",
      }),
    ).toBe("sg_light:round_story:story-456:trend");

    expect(
      buildSgLightImpressionKey({
        surface: "round_story",
        contextId: "story-456",
        cardType: "trend",
        focusCategory: "tee",
      }),
    ).toBe("sg_light:round_story:story-456:trend:tee");
  });

  it("pairs trend impression telemetry with the locked event name", () => {
    expect(
      buildSgLightTrendImpressionTelemetry({
        surface: "round_story",
        platform: "web",
        roundId: "story-456",
        trend: {
          windowSize: 5,
          perCategory: {
            tee: { avgDelta: 0.1, rounds: 5 },
            approach: { avgDelta: 0.2, rounds: 5 },
            short_game: { avgDelta: -0.1, rounds: 5 },
            putting: { avgDelta: 0.0, rounds: 5 },
          },
          focusHistory: [
            { focusCategory: "tee", roundId: "story-456", playedAt: "2024-01-01" },
          ],
        },
        focusCategory: "tee",
      }),
    ).toEqual({
      eventName: SG_LIGHT_TREND_VIEWED_EVENT,
      payload: {
        surface: "round_story",
        platform: "web",
        roundId: "story-456",
        windowSize: 5,
        focusCategory: "tee",
      },
    });
  });

  it("locks explainer payloads", () => {
    expect(SG_LIGHT_EXPLAINER_OPENED_EVENT).toBe("sg_light_explainer_opened");
    expect(SG_LIGHT_PRACTICE_FOCUS_ENTRY_SHOWN_EVENT).toBe("practice_focus_entry_shown");

    expect(
      buildSgLightExplainerOpenedPayload({ surface: "round_recap", contextId: "round-999" }),
    ).toEqual({ surface: "round_recap", roundId: "round-999" });

    expect(buildSgLightExplainerOpenedPayload({ surface: "player_stats", contextId: null })).toEqual({
      surface: "player_stats",
    });
  });

  it("pairs explainer open telemetry with the locked event name", () => {
    expect(
      buildSgLightExplainerOpenTelemetry({ surface: "round_recap", contextId: "round-111" }),
    ).toEqual({ eventName: SG_LIGHT_EXPLAINER_OPENED_EVENT, payload: { surface: "round_recap", roundId: "round-111" } });
  });

  it("locks practice CTA payloads across sg light cards", () => {
    expect(SG_LIGHT_PRACTICE_RECOMMENDATION_CLICKED_EVENT).toBe("practice_mission_recommendation_clicked");

    expect(
      buildSgLightPracticeCtaClickedPayload({
        missionId: "sg_light_focus",
        reason: "focus_area",
        rank: 1,
        surface: "web_round_recap",
        entryPoint: "sg_light_focus_card",
        focusArea: "approach_focus",
        origin: "web_round_recap",
        strokesGainedLightFocusCategory: "approach",
      }),
    ).toEqual({
      missionId: "sg_light_focus",
      reason: "focus_area",
      rank: 1,
      surface: "web_round_recap",
      entryPoint: "sg_light_focus_card",
      focusArea: "approach_focus",
      origin: "web_round_recap",
      strokesGainedLightFocusCategory: "approach",
    });

    expect(
      buildSgLightPracticeCtaClickedPayload({
        missionId: "sg_light_focus",
        reason: "focus_area",
        rank: 1,
        surface: "web_round_story",
        entryPoint: "sg_light_focus_card",
        focusArea: "tee_focus",
        origin: "web_round_story",
        strokesGainedLightFocusCategory: "tee",
      }),
    ).toEqual({
      missionId: "sg_light_focus",
      reason: "focus_area",
      rank: 1,
      surface: "web_round_story",
      entryPoint: "sg_light_focus_card",
      focusArea: "tee_focus",
      origin: "web_round_story",
      strokesGainedLightFocusCategory: "tee",
    });
  });

  it("pairs practice CTA click telemetry with the locked event name", () => {
    const payload: SgLightPracticeCtaClickedPayload = {
      missionId: "sg_light_focus",
      reason: "focus_area",
      rank: 1,
      surface: "web_round_recap" as const,
      entryPoint: "sg_light_focus_card" as const,
      focusArea: "approach_focus",
      origin: "web_round_recap" as const,
      strokesGainedLightFocusCategory: "approach" as const,
    };

    expect(buildSgLightPracticeCtaClickTelemetry(payload)).toEqual({
      eventName: SG_LIGHT_PRACTICE_RECOMMENDATION_CLICKED_EVENT,
      payload: {
        missionId: "sg_light_focus",
        reason: "focus_area",
        rank: 1,
        surface: "web_round_recap",
        entryPoint: "sg_light_focus_card",
        focusArea: "approach_focus",
        origin: "web_round_recap",
        strokesGainedLightFocusCategory: "approach",
      },
    });
  });

  it("pairs practice focus entry shown telemetry with the locked event name", () => {
    expect(
      buildSgLightPracticeFocusEntryShownTelemetry({
        surface: "mobile_stats_sg_light_trend",
        focusCategory: "putting",
      }),
    ).toEqual({
      eventName: SG_LIGHT_PRACTICE_FOCUS_ENTRY_SHOWN_EVENT,
      payload: { surface: "mobile_stats_sg_light_trend", focusCategory: "putting" },
    });
  });
});
