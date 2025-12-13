import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import "@/i18n";
import { RoundShareView, type RoundShareData } from "@/pages/share/RoundShareView";
import {
  trackPracticeMissionRecommendationClicked,
  trackPracticeMissionRecommendationShown,
} from "@/practice/analytics";

vi.mock("@/practice/analytics", () => ({
  trackPracticeMissionRecommendationClicked: vi.fn(),
  trackPracticeMissionRecommendationShown: vi.fn(),
}));

const mockShown = vi.mocked(trackPracticeMissionRecommendationShown);
const mockClicked = vi.mocked(trackPracticeMissionRecommendationClicked);

const SAMPLE_ROUND: RoundShareData = {
  roundId: "round-1",
  courseName: "Test Course",
  score: 72,
  toPar: "E",
  date: new Date("2024-06-01").toISOString(),
  strokesGainedLight: {
    totalDelta: -1.2,
    focusCategory: "approach",
    byCategory: [
      { category: "tee", shots: 8, delta: -0.2, confidence: 0.6 },
      { category: "approach", shots: 10, delta: -0.7, confidence: 0.7 },
      { category: "short_game", shots: 5, delta: 0.1, confidence: 0.6 },
      { category: "putting", shots: 30, delta: -0.4, confidence: 0.8 },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

test("renders SG Light summary and practice CTA with context", async () => {
  render(<RoundShareView data={SAMPLE_ROUND} />);

  expect(await screen.findByText(/Strokes Gained Light/i)).toBeInTheDocument();
  expect(screen.getByText(/Focus this round/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Approach/i).length).toBeGreaterThan(0);

  const cta = screen.getByTestId("share-sg-light-practice-cta");
  const href = cta.getAttribute("href") ?? "";
  const url = new URL(href, "https://example.com");
  const recommendation = JSON.parse(url.searchParams.get("recommendation") ?? "{}");

  expect(url.searchParams.get("source")).toBe("web_round_share");
  expect(recommendation.strokesGainedLightFocusCategory).toBe("approach");

  await userEvent.click(cta);
  expect(mockShown).toHaveBeenCalled();
  expect(mockClicked).toHaveBeenCalled();
});

test("hides CTA when SG Light data is insufficient", () => {
  const lowConfidence: RoundShareData = {
    ...SAMPLE_ROUND,
    strokesGainedLight: {
      totalDelta: 0,
      focusCategory: null,
      byCategory: [
        { category: "tee", shots: 2, delta: 0, confidence: 0.1 },
      ],
    },
  };

  render(<RoundShareView data={lowConfidence} />);

  expect(
    screen.getByText(/Not enough strokes gained data yet for this round/i),
  ).toBeInTheDocument();
  expect(screen.queryByTestId("share-sg-light-practice-cta")).not.toBeInTheDocument();
  expect(mockShown).not.toHaveBeenCalled();
  expect(mockClicked).not.toHaveBeenCalled();
});
