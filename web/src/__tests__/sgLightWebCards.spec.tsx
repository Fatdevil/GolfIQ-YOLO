import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SgLightSummaryCardWeb } from "@/sg/SgLightSummaryCardWeb";
import { SgLightTrendCardWeb } from "@/sg/SgLightTrendCardWeb";
import type { StrokesGainedLightSummary, StrokesGainedLightTrend } from "@shared/stats/strokesGainedLight";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
}));

afterEach(() => cleanup());

vi.mock("@/practice/analytics", () => ({
  trackPracticeMissionRecommendationShown: vi.fn(),
  trackPracticeMissionRecommendationClicked: vi.fn(),
}));

describe("SG Light web cards", () => {
  const summary: StrokesGainedLightSummary = {
    totalDelta: -1.2,
    focusCategory: "approach",
    byCategory: [
      { category: "tee", shots: 12, delta: 0.1, confidence: 0.4 },
      { category: "approach", shots: 18, delta: -1.2, confidence: 0.6 },
    ],
  };

  const trend: StrokesGainedLightTrend = {
    windowSize: 3,
    perCategory: {
      tee: { avgDelta: 0.2, rounds: 3 },
      approach: { avgDelta: -0.6, rounds: 3 },
      short_game: { avgDelta: 0.1, rounds: 3 },
      putting: { avgDelta: 0.0, rounds: 3 },
    },
    focusHistory: [
      { roundId: "r1", playedAt: "2024-01-01", focusCategory: "approach" },
      { roundId: "r0", playedAt: "2023-12-12", focusCategory: "tee" },
    ],
  };

  it("renders summary card with CTA when focus is available", async () => {
    const builder = vi.fn().mockReturnValue("/range/practice?source=web_round_recap");
    render(<SgLightSummaryCardWeb summary={summary} practiceHrefBuilder={builder} />);

    expect(await screen.findByText(/Strokes Gained Light/i)).toBeInTheDocument();
    expect(screen.getByTestId("sg-light-category-approach")).toBeInTheDocument();

    const cta = screen.getByTestId("sg-light-practice-cta");
    await userEvent.click(cta);
    expect(builder).toHaveBeenCalled();
  });

  it("hides practice CTA when summary has low confidence", () => {
    render(<SgLightSummaryCardWeb summary={null} />);

    expect(screen.queryByTestId("sg-light-practice-cta")).not.toBeInTheDocument();
  });

  it("shows trend focus and CTA when trend is provided", async () => {
    const builder = vi.fn().mockReturnValue("/range/practice?source=web_round_story");

    render(
      <SgLightTrendCardWeb
        trend={trend}
        practiceHrefBuilder={builder}
        practiceSurface="web_round_story"
      />,
    );

    expect(await screen.findByTestId("sg-light-trend-card")).toBeInTheDocument();
    const cta = screen.getByTestId("sg-light-trend-practice-cta");
    await userEvent.click(cta);
    expect(builder).toHaveBeenCalled();
  });
});
