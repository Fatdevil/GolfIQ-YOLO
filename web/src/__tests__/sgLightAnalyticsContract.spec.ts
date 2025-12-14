import { describe, expect, it } from "vitest";

import {
  buildSgLightExplainerOpenedPayload,
  buildSgLightImpressionKey,
  buildSgLightPracticeCtaClickedPayload,
  SG_LIGHT_EXPLAINER_OPENED_EVENT,
  SG_LIGHT_PRACTICE_FOCUS_ENTRY_SHOWN_EVENT,
  SG_LIGHT_PRACTICE_RECOMMENDATION_CLICKED_EVENT,
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
});
