import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/range/api", () => ({
  postRangeAnalyze: vi.fn(),
}));
vi.mock("@/user/historyApi", () => ({
  postRangeSessionSnapshots: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/user/UserSessionContext", () => ({
  UserSessionProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useUserSession: () => ({ session: { userId: "test-user", createdAt: "" }, loading: false }),
}));
vi.mock("@/access/UserAccessContext", () => ({
  useAccessPlan: () => ({ isPro: true, loading: false }),
}));
vi.mock("@/practice/practiceMissionHistory", async () => {
  const actual = await vi.importActual<typeof import("@/practice/practiceMissionHistory")>(
    "@/practice/practiceMissionHistory"
  );

  return {
    ...actual,
    loadPracticeMissionHistory: vi.fn(),
  };
});
vi.mock("@/api/bagStatsClient", () => ({ fetchBagStats: vi.fn() }));
vi.mock("@shared/caddie/bagPracticeRecommendations", () => ({
  buildBagPracticeRecommendations: vi.fn(),
}));

import { postRangeAnalyze } from "@/features/range/api";
import RangePracticePage from "./RangePracticePage";
import { MissionDetails } from "./RangePracticePage";
import { RangeImpactCard } from "../range/RangeImpactCard";
import type { RangeShotMetrics } from "../range/types";
import { RANGE_MISSIONS } from "@/range/missions";
import { UnitsContext } from "@/preferences/UnitsContext";
import type { DistanceUnit } from "@/preferences/units";
import { UserSessionProvider } from "@/user/UserSessionContext";
import { postRangeSessionSnapshots } from "@/user/historyApi";
import { loadPracticeMissionHistory } from "@/practice/practiceMissionHistory";
import { fetchBagStats } from "@/api/bagStatsClient";
import { buildBagPracticeRecommendations } from "@shared/caddie/bagPracticeRecommendations";

const mockedPostRangeAnalyze = vi.mocked(postRangeAnalyze);
const mockedFetchBagStats = vi.mocked(fetchBagStats);
const mockedBuildRecommendations = vi.mocked(buildBagPracticeRecommendations);

describe("RangePracticePage", () => {
  beforeEach(() => {
    mockedPostRangeAnalyze.mockReset();
    vi.mocked(postRangeSessionSnapshots).mockReset();
    vi.mocked(loadPracticeMissionHistory).mockResolvedValue([]);
    mockedFetchBagStats.mockResolvedValue({});
    mockedBuildRecommendations.mockReturnValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it("logs a shot and updates UI", async () => {
    mockedPostRangeAnalyze.mockResolvedValue({
      ball_speed_mps: 60,
      ball_speed_mph: 134,
      carry_m: 180,
      launch_deg: 12,
      side_deg: -3,
      quality: { score: 0.9, level: "good", reasons: [] },
    });

    renderWithUnit("metric", <RangePracticePage />);

    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/Club/i), "PW");
    const [hitButton] = screen.getAllByRole("button", { name: /Hit & analyze/i });
    await user.click(hitButton);

    await waitFor(() => expect(mockedPostRangeAnalyze).toHaveBeenCalledTimes(1));

    await screen.findByText("134.0 mph");
    await screen.findAllByText("180 m");
    expect(screen.getByText("Shots: 1")).toBeDefined();
    expect(screen.getByText(/Pitching wedge • 134.0 mph/)).toBeDefined();
  });

  it("posts snapshot when ending a session", async () => {
    mockedPostRangeAnalyze.mockResolvedValue({
      ball_speed_mps: 60,
      ball_speed_mph: 134,
      carry_m: 180,
      launch_deg: 12,
      side_deg: -3,
      quality: { score: 0.9, level: "good", reasons: [] },
    });

    renderWithUnit("metric", <RangePracticePage />);

    const user = userEvent.setup();
    const hitButtons = screen.getAllByRole("button", { name: /Hit & analyze/i });
    await user.click(hitButtons[0]);

    await waitFor(() => expect(mockedPostRangeAnalyze).toHaveBeenCalledTimes(1));

    const endButtons = screen.getAllByRole("button", { name: /End session/i });
    await user.click(endButtons[0]);

    await waitFor(() =>
      expect(postRangeSessionSnapshots).toHaveBeenCalledTimes(1)
    );
  });

  it("renders impact card carry in yards when unit is imperial", () => {
    const metrics: RangeShotMetrics = {
      ballSpeedMph: 134,
      ballSpeedMps: 60,
      carryM: 150,
      launchDeg: 12,
      sideAngleDeg: 0,
      quality: "good",
    };

    renderWithUnit(
      "imperial",
      <RangeImpactCard metrics={metrics} />,
    );

    expect(screen.getByText("164 yd")).toBeDefined();
  });

  it("shows mission history progress when available", () => {
    const mission = RANGE_MISSIONS[0];
    renderWithUnit(
      "metric",
      <MissionDetails
        mission={mission}
        missionProgress={null}
        missionHistoryProgress={{
          missionId: mission.id,
          completedSessions: 2,
          lastCompletedAt: Date.now(),
          inStreak: true,
        }}
        unit="metric"
      />,
      "/range/practice"
    );

    const progressNode = screen.getByTestId("mission-history-progress");
    expect(progressNode).toHaveTextContent("2 sessions in the last 14 days");
    expect(progressNode).toHaveTextContent("On a streak");
  });

  it("shows empty mission progress when no history", () => {
    const mission = RANGE_MISSIONS[1];
    renderWithUnit(
      "metric",
      <MissionDetails
        mission={mission}
        missionProgress={null}
        missionHistoryProgress={{
          missionId: mission.id,
          completedSessions: 0,
          lastCompletedAt: null,
          inStreak: false,
        }}
        unit="metric"
      />,
      "/range/practice"
    );

    const progressNode = screen.getByTestId("mission-history-progress");
    expect(progressNode).toHaveTextContent("Not practised yet");
  });

  it("renders recommendations in priority order with status labels", async () => {
    mockedBuildRecommendations.mockReturnValue([
      {
        id: "practice_fill_gap:7i:8i",
        titleKey: "bag.practice.fill_gap.title",
        descriptionKey: "bag.practice.fill_gap.description",
        targetClubs: ["7i", "8i"],
        targetSampleCount: 12,
        sourceSuggestionId: "fill_gap:7i:8i",
        status: "due",
        priorityScore: 30,
        lastCompletedAt: null,
      },
      {
        id: "practice_calibrate:pw",
        titleKey: "bag.practice.calibrate.title",
        descriptionKey: "bag.practice.calibrate.more_samples.description",
        targetClubs: ["PW"],
        targetSampleCount: 8,
        sourceSuggestionId: "calibrate:pw",
        status: "fresh",
        priorityScore: 5,
        lastCompletedAt: null,
      },
    ] as any);

    renderWithUnit("metric", <RangePracticePage />);

    const items = await screen.findAllByTestId("range-practice-recommendation");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/Due for tune-up/);
    expect(items[1]).toHaveTextContent(/Keep it sharp/);
  });

  it("shows empty progress text when history is missing", async () => {
    mockedBuildRecommendations.mockReturnValue([
      {
        id: "practice_calibrate:9i",
        titleKey: "bag.practice.calibrate.title",
        descriptionKey: "bag.practice.calibrate.more_samples.description",
        targetClubs: ["9i"],
        targetSampleCount: 10,
        sourceSuggestionId: "calibrate:9i",
        status: "new",
        priorityScore: 10,
        lastCompletedAt: null,
      },
    ] as any);
    vi.mocked(loadPracticeMissionHistory).mockResolvedValue([]);

    renderWithUnit("metric", <RangePracticePage />);

    const progress = await screen.findByTestId("range-practice-recommendation-progress");
    expect(progress).toHaveTextContent("Not practised yet");
  });
});

function renderWithUnit(
  unit: DistanceUnit,
  ui: React.ReactElement,
  initialPath = "/range/practice"
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <UserSessionProvider>
        <UnitsContext.Provider value={{ unit, setUnit: () => {} }}>
          {ui}
        </UnitsContext.Provider>
      </UserSessionProvider>
    </MemoryRouter>
  );
}
