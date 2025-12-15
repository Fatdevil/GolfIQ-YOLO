import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SgLightSummaryCardWeb } from "@/sg/SgLightSummaryCardWeb";
import { SgLightTrendCardWeb } from "@/sg/SgLightTrendCardWeb";
import { trackPracticeMissionRecommendationShown } from "@/practice/analytics";
import type { StrokesGainedLightSummary, StrokesGainedLightTrend } from "@shared/stats/strokesGainedLight";
import { trackSgLightExplainerOpenedWeb, trackSgLightPracticeCtaClickedWeb } from "@/sg/analytics";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
}));

beforeEach(() => {
  vi.stubEnv?.("VITE_FEATURE_SG_LIGHT", "1");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs?.();
});

vi.mock("@/practice/analytics", () => ({
  trackPracticeMissionRecommendationShown: vi.fn(),
  trackPracticeMissionRecommendationClicked: vi.fn(),
}));
vi.mock("@/sg/analytics", () => ({
  trackSgLightExplainerOpenedWeb: vi.fn(),
  trackSgLightPracticeCtaClickedWeb: vi.fn(),
}));

const mockTrackExplainer = vi.mocked(trackSgLightExplainerOpenedWeb);
const mockTrackPracticeCta = vi.mocked(trackSgLightPracticeCtaClickedWeb);

describe("SG Light web cards", () => {
  const matchesSgLightDialogName = (name: string) =>
    /sg light/i.test(name) || /sg_light\.explainer\.heading/i.test(name);

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
    expect(mockTrackPracticeCta).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "web_round_recap" }),
    );
  });

  it("tracks summary impression once per display context", async () => {
    const builder = vi.fn().mockReturnValue("/range/practice?source=web_round_recap");

    const { rerender } = render(
      <SgLightSummaryCardWeb
        summary={summary}
        practiceHrefBuilder={builder}
        roundId="round-1"
        practiceSurface="web_round_recap"
      />,
    );

    await waitFor(() => expect(trackPracticeMissionRecommendationShown).toHaveBeenCalledTimes(1));

    rerender(
      <SgLightSummaryCardWeb
        summary={summary}
        practiceHrefBuilder={builder}
        roundId="round-1"
        practiceSurface="web_round_recap"
      />,
    );

    expect(trackPracticeMissionRecommendationShown).toHaveBeenCalledTimes(1);

    rerender(
      <SgLightSummaryCardWeb
        summary={{ ...summary, focusCategory: "tee" }}
        practiceHrefBuilder={builder}
        roundId="round-1"
        practiceSurface="web_round_recap"
      />,
    );

    expect(trackPracticeMissionRecommendationShown).toHaveBeenCalledTimes(1);
  });

  it("opens explainer from summary card", async () => {
    render(<SgLightSummaryCardWeb summary={summary} />);

    const trigger = await screen.findByTestId("open-sg-light-explainer");
    await userEvent.click(trigger);

    const explainer = await screen.findByRole("dialog", {
      name: matchesSgLightDialogName,
    });
    expect(explainer).toBeInTheDocument();
    expect(mockTrackExplainer).toHaveBeenCalledWith({ surface: "round_recap" });
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
    expect(mockTrackPracticeCta).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "web_round_story" }),
    );
  });

  it("opens explainer from trend card", async () => {
    render(<SgLightTrendCardWeb trend={trend} />);

    const trigger = await screen.findByTestId("open-sg-light-explainer");
    await userEvent.click(trigger);

    const explainer = await screen.findByRole("dialog", {
      name: matchesSgLightDialogName,
    });
    expect(explainer).toBeInTheDocument();
    expect(mockTrackExplainer).toHaveBeenCalledWith({ surface: "round_story" });
  });

  it("tracks SG Light trend practice impression only once per display", async () => {
    const builder = vi.fn().mockReturnValue("/range/practice?source=web_round_story");

    const { rerender } = render(
      <SgLightTrendCardWeb
        trend={trend}
        practiceHrefBuilder={builder}
        practiceSurface="web_round_story"
      />,
    );

    expect(await screen.findByTestId("sg-light-trend-card")).toBeInTheDocument();
    expect(trackPracticeMissionRecommendationShown).toHaveBeenCalledTimes(1);

    rerender(
      <SgLightTrendCardWeb
        trend={trend}
        practiceHrefBuilder={builder}
        practiceSurface="web_round_story"
      />,
    );

    expect(trackPracticeMissionRecommendationShown).toHaveBeenCalledTimes(1);
  });

  it("keeps SG Light trend impression deduped when focus changes", async () => {
    const builder = vi.fn().mockReturnValue("/range/practice?source=web_round_story");

    const { rerender } = render(
      <SgLightTrendCardWeb
        trend={trend}
        practiceHrefBuilder={builder}
        practiceSurface="web_round_story"
        roundId="round-1"
      />,
    );

    await waitFor(() => expect(trackPracticeMissionRecommendationShown).toHaveBeenCalledTimes(1));

    rerender(
      <SgLightTrendCardWeb
        trend={{ ...trend, focusHistory: [{ roundId: "round-1", playedAt: "2024-02-01", focusCategory: "tee" }] }}
        practiceHrefBuilder={builder}
        practiceSurface="web_round_story"
        roundId="round-1"
      />,
    );

    await waitFor(() => expect(trackPracticeMissionRecommendationShown).toHaveBeenCalledTimes(1));
  });

  it("does not track SG Light trend impression without a focus", async () => {
    render(
      <SgLightTrendCardWeb
        trend={{ ...trend, focusHistory: [] }}
        practiceHrefBuilder={() => "/range/practice"}
        practiceSurface="web_round_story"
      />,
    );

    expect(await screen.findByTestId("sg-light-trend-card")).toBeInTheDocument();
    expect(trackPracticeMissionRecommendationShown).not.toHaveBeenCalled();
  });
});
