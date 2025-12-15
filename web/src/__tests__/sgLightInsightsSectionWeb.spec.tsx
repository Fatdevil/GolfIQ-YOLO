import React from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SgLightInsightsSectionWeb } from "@/sg/SgLightInsightsSectionWeb";
import {
  trackPracticeMissionRecommendationClicked,
  trackPracticeMissionRecommendationShown,
} from "@/practice/analytics";
import type {
  StrokesGainedLightCategory,
  StrokesGainedLightSummary,
  StrokesGainedLightTrend,
} from "@shared/stats/strokesGainedLight";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
}));

vi.mock("@/practice/analytics", () => ({
  trackPracticeMissionRecommendationShown: vi.fn(),
  trackPracticeMissionRecommendationClicked: vi.fn(),
}));

vi.mock("@/api", () => ({
  postTelemetryEvent: vi.fn().mockResolvedValue(undefined),
}));

const summary: StrokesGainedLightSummary = {
  totalDelta: 0.6,
  focusCategory: "approach",
  byCategory: [
    { category: "approach", shots: 10, delta: 0.6, confidence: 0.8 },
    { category: "tee", shots: 5, delta: 0.2, confidence: 0.8 },
  ],
};

const trend: StrokesGainedLightTrend = {
  windowSize: 3,
  perCategory: {
    approach: { avgDelta: 0.4, rounds: 3 },
    tee: { avgDelta: 0.1, rounds: 3 },
    short_game: { avgDelta: 0.0, rounds: 3 },
    putting: { avgDelta: -0.1, rounds: 3 },
  },
  focusHistory: [{ roundId: "round-123", playedAt: "2024-01-01", focusCategory: "approach" }],
};

describe("SgLightInsightsSectionWeb", () => {
  beforeEach(() => {
    vi.stubEnv?.("VITE_FEATURE_SG_LIGHT", "1");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs?.();
  });

  it("renders cards and dedupes impression tracking per context", async () => {
    const practiceHrefBuilder = (focusCategory: StrokesGainedLightCategory) =>
      `/range/practice?focus=${focusCategory}`;

    const { rerender } = render(
      <SgLightInsightsSectionWeb
        surface="round_story"
        contextId="round-123"
        sgLightSummary={summary}
        sgLightTrend={trend}
        practiceHrefBuilder={practiceHrefBuilder}
      />,
    );

    await waitFor(() =>
      expect(trackPracticeMissionRecommendationShown).toHaveBeenCalledTimes(2),
    );

    rerender(
      <SgLightInsightsSectionWeb
        surface="round_story"
        contextId="round-123"
        sgLightSummary={summary}
        sgLightTrend={trend}
        practiceHrefBuilder={practiceHrefBuilder}
      />,
    );

    expect(trackPracticeMissionRecommendationShown).toHaveBeenCalledTimes(2);
    expect(trackPracticeMissionRecommendationClicked).not.toHaveBeenCalled();
  });

  it("hides SG Light insights and tracking when the flag is disabled", () => {
    vi.stubEnv?.("VITE_FEATURE_SG_LIGHT", "0");

    const { container } = render(
      <SgLightInsightsSectionWeb
        surface="round_story"
        contextId="round-123"
        sgLightSummary={summary}
        sgLightTrend={trend}
      />,
    );

    expect(container.firstChild).toBeNull();
    expect(trackPracticeMissionRecommendationShown).not.toHaveBeenCalled();
    expect(trackPracticeMissionRecommendationClicked).not.toHaveBeenCalled();
  });
});

