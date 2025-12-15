import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoundStoryInsights } from "./RoundStoryInsights";
import { trackPracticeMissionRecommendationShown } from "@/practice/analytics";
import { trackSgLightExplainerOpenedWeb, trackSgLightPracticeCtaClickedWeb } from "@/sg/analytics";
import type {
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
}));

vi.mock("@/sg/analytics", () => ({
  trackSgLightExplainerOpenedWeb: vi.fn(),
  trackSgLightPracticeCtaClickedWeb: vi.fn(),
}));

const matchesSgLightDialogName = (name: string) =>
  /sg light/i.test(name) || /sg_light\.explainer\.heading/i.test(name);

const summary: StrokesGainedLightSummary = {
  totalDelta: 0.6,
  focusCategory: "approach",
  byCategory: [
    { category: "approach", shots: 10, delta: 0.6, confidence: 0.8 },
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

describe("RoundStoryInsights", () => {
  beforeEach(() => {
    vi.stubEnv?.("VITE_FEATURE_SG_LIGHT", "1");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllEnvs?.();
  });

  it("renders SG Light summary and trend with story context", async () => {
    render(
      <RoundStoryInsights
        summary={summary}
        trend={trend}
        rounds={[]}
        roundId="round-123"
        practiceHrefBuilder={() => "/range/practice?source=web_round_story"}
      />,
    );

    expect(await screen.findByText(/Strokes Gained Light/i)).toBeInTheDocument();
    expect(screen.getByText(/Recent SG Light trend/i)).toBeInTheDocument();
  });

  it("dedupes impression tracking across rerenders for the same story", async () => {
    const { rerender } = render(
      <RoundStoryInsights
        summary={summary}
        trend={trend}
        rounds={[]}
        roundId="round-123"
        practiceHrefBuilder={() => "/range/practice?source=web_round_story"}
      />,
    );

    await waitFor(() => expect(trackPracticeMissionRecommendationShown).toHaveBeenCalledTimes(2));

    rerender(
      <RoundStoryInsights
        summary={summary}
        trend={trend}
        rounds={[]}
        roundId="round-123"
        practiceHrefBuilder={() => "/range/practice?source=web_round_story"}
      />,
    );

    expect(trackPracticeMissionRecommendationShown).toHaveBeenCalledTimes(2);
  });

  it("tracks CTA and explainer clicks from the story surface", async () => {
    render(
      <RoundStoryInsights
        summary={summary}
        trend={trend}
        rounds={[]}
        roundId="round-123"
        practiceHrefBuilder={() => "/range/practice?source=web_round_story"}
      />,
    );

    const trendCta = await screen.findByTestId("sg-light-trend-practice-cta");
    await userEvent.click(trendCta);

    expect(trackSgLightPracticeCtaClickedWeb).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "web_round_story" }),
    );

    const [explainerTrigger] = await screen.findAllByLabelText(/Open SG Light explainer/i);
    await userEvent.click(explainerTrigger);

    const dialog = await screen.findByRole("dialog", { name: matchesSgLightDialogName });
    expect(dialog).toBeInTheDocument();
    expect(trackSgLightExplainerOpenedWeb).toHaveBeenCalledWith({ surface: "round_story" });
  });
});

