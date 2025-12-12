import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import "@/i18n";
import type { PlayerAnalytics } from "@/api/analytics";
import { fetchPlayerAnalytics } from "@/api/analytics";
import { PlayerAnalyticsDashboard } from "@/profile/PlayerAnalyticsDashboard";
import { PlayerAnalyticsSection } from "@/profile/PlayerAnalyticsSection";
import { useAccessFeatures, useAccessPlan } from "@/access/UserAccessContext";
import {
  trackPracticeMissionRecommendationClicked,
  trackPracticeMissionRecommendationShown,
} from "@/practice/analytics";

vi.mock("@/access/UserAccessContext", () => ({
  useAccessPlan: vi.fn(),
  useAccessFeatures: vi.fn(),
}));

vi.mock("@/api/analytics", () => ({
  fetchPlayerAnalytics: vi.fn(),
}));

vi.mock("@/practice/analytics", () => ({
  trackPracticeMissionRecommendationClicked: vi.fn(),
  trackPracticeMissionRecommendationShown: vi.fn(),
}));

const mockUseAccessPlan = vi.mocked(useAccessPlan);
const mockUseAccessFeatures = vi.mocked(useAccessFeatures);
const mockFetchPlayerAnalytics = vi.mocked(fetchPlayerAnalytics);
const mockTrackPracticeRecommendationShown = vi.mocked(trackPracticeMissionRecommendationShown);
const mockTrackPracticeRecommendationClicked = vi.mocked(trackPracticeMissionRecommendationClicked);

beforeEach(() => {
  vi.clearAllMocks();
});

const SAMPLE_ANALYTICS: PlayerAnalytics = {
  memberId: "member-1",
  sgTrend: [
    {
      runId: "run-1",
      date: new Date("2024-05-01").toISOString(),
      sgTotal: -1.2,
      sgTee: -0.5,
      sgApproach: -0.3,
      sgShort: -0.2,
      sgPutt: -0.2,
    },
    {
      runId: "run-2",
      date: new Date("2024-06-01").toISOString(),
      sgTotal: 0.8,
      sgTee: 0.2,
      sgApproach: 0.3,
      sgShort: 0.1,
      sgPutt: 0.2,
    },
  ],
  categoryStatus: [
    { category: "tee", recentTrend: "improving", lastSeverity: "ok" },
    { category: "approach", recentTrend: "stable", lastSeverity: "critical" },
    { category: "short", recentTrend: "stable", lastSeverity: "focus" },
    { category: "putt", recentTrend: "worsening", lastSeverity: "ok" },
    { category: "sequence", recentTrend: "stable", lastSeverity: "ok" },
  ],
  missionStats: { totalMissions: 3, completed: 1, completionRate: 0.33 },
  bestRoundId: "run-2",
  worstRoundId: "run-1",
  strokesGainedLightRounds: [
    {
      roundId: "run-3",
      playedAt: new Date("2024-07-01").toISOString(),
      totalDelta: -1.1,
      focusCategory: "tee",
      byCategory: [
        { category: "tee", shots: 6, delta: -0.6, confidence: 0.6 },
        { category: "approach", shots: 8, delta: -0.3, confidence: 0.7 },
        { category: "short_game", shots: 4, delta: -0.1, confidence: 0.5 },
        { category: "putting", shots: 8, delta: -0.1, confidence: 0.8 },
      ],
    },
    {
      roundId: "run-4",
      playedAt: new Date("2024-07-10").toISOString(),
      totalDelta: -0.8,
      focusCategory: "approach",
      byCategory: [
        { category: "tee", shots: 6, delta: -0.2, confidence: 0.6 },
        { category: "approach", shots: 8, delta: -0.4, confidence: 0.6 },
        { category: "short_game", shots: 4, delta: -0.1, confidence: 0.5 },
        { category: "putting", shots: 8, delta: -0.1, confidence: 0.8 },
      ],
    },
  ],
};

function renderWithRouter(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

test("PlayerAnalyticsDashboard renders categories and sg trend", () => {
  renderWithRouter(<PlayerAnalyticsDashboard analytics={SAMPLE_ANALYTICS} />);

  expect(screen.getByText("Tee")).toBeInTheDocument();
  expect(screen.getByText("Approach")).toBeInTheDocument();
  expect(screen.getByText(/critical/i)).toBeInTheDocument();
  expect(screen.getByText(/Recent SG trend/i)).toBeInTheDocument();
  expect(screen.getByText(/Run run-1/)).toBeInTheDocument();
  expect(screen.getByText(/Best/i)).toBeInTheDocument();
  expect(screen.getByText(/completed missions/i)).toBeInTheDocument();
});

test("PlayerAnalyticsSection gates non-pro users", () => {
  mockUseAccessPlan.mockReturnValue({ isPro: false, loading: false } as any);
  mockUseAccessFeatures.mockReturnValue({
    hasFeature: vi.fn(),
    hasPlanFeature: vi.fn().mockReturnValue(false),
    loading: false,
  } as any);
  renderWithRouter(<PlayerAnalyticsSection />);

  expect(screen.getByText(/Unlock personalised/)).toBeInTheDocument();
  expect(mockFetchPlayerAnalytics).not.toHaveBeenCalled();
});

test("PlayerAnalyticsSection loads analytics for pro users", async () => {
  mockUseAccessPlan.mockReturnValue({ isPro: true, loading: false } as any);
  mockUseAccessFeatures.mockReturnValue({
    hasFeature: vi.fn(),
    hasPlanFeature: vi.fn().mockReturnValue(true),
    loading: false,
  } as any);
  mockFetchPlayerAnalytics.mockResolvedValue(SAMPLE_ANALYTICS);

  renderWithRouter(<PlayerAnalyticsSection />);

  await waitFor(() => {
    expect(mockFetchPlayerAnalytics).toHaveBeenCalled();
    expect(screen.getAllByText(/Player analytics/i).length).toBeGreaterThan(0);
  });
});

test("shows SG Light trend with practice CTA when enough data", async () => {
  mockUseAccessPlan.mockReturnValue({ isPro: true, loading: false } as any);
  mockUseAccessFeatures.mockReturnValue({
    hasFeature: vi.fn(),
    hasPlanFeature: vi.fn().mockReturnValue(true),
    loading: false,
  } as any);
  mockFetchPlayerAnalytics.mockResolvedValue(SAMPLE_ANALYTICS);

  renderWithRouter(<PlayerAnalyticsSection />);

  const headline = await screen.findByTestId("player-analytics-sg-light-headline");
  expect(headline).toHaveTextContent(/Focus:/i);

  const cta = screen.getByTestId("player-analytics-sg-light-cta");
  expect(cta.getAttribute("href")).toContain("/range/practice?");

  await userEvent.click(cta);

  expect(mockTrackPracticeRecommendationShown).toHaveBeenCalled();
  expect(mockTrackPracticeRecommendationClicked).toHaveBeenCalled();
});

test("hides SG Light CTA when trend is unavailable", async () => {
  mockUseAccessPlan.mockReturnValue({ isPro: true, loading: false } as any);
  mockUseAccessFeatures.mockReturnValue({
    hasFeature: vi.fn(),
    hasPlanFeature: vi.fn().mockReturnValue(true),
    loading: false,
  } as any);
  mockFetchPlayerAnalytics.mockResolvedValue({ ...SAMPLE_ANALYTICS, strokesGainedLightRounds: SAMPLE_ANALYTICS.strokesGainedLightRounds?.slice(0, 1) });

  renderWithRouter(<PlayerAnalyticsSection />);

  await waitFor(() => {
    expect(screen.getByText(/Not enough strokes gained data yet/i)).toBeInTheDocument();
  });

  expect(screen.queryByTestId("player-analytics-sg-light-cta")).not.toBeInTheDocument();
  expect(mockTrackPracticeRecommendationShown).not.toHaveBeenCalled();
  expect(mockTrackPracticeRecommendationClicked).not.toHaveBeenCalled();
});
