import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { HomeHubPage } from "@/pages/home/HomeHubPage";
import * as bagStatsApi from "@/api/bagStatsClient";
import { loadBag } from "@web/bag/storage";
import { createDefaultBag } from "@web/bag/types";
import { UnitsProvider } from "@/preferences/UnitsContext";
import type { BagClubStatsMap } from "@shared/caddie/bagStats";
import { loadPracticeMissionHistory } from "@/practice/practiceMissionHistory";
import { buildWeeklyPracticeGoalSettingsUpdatedEvent } from "@shared/practice/practiceGoalAnalytics";
import * as experiments from "@shared/experiments/flags";

vi.mock("@/access/UserAccessContext", () => ({
  useAccessPlan: vi.fn(),
  useAccessFeatures: vi.fn(),
  useFeatureFlag: vi.fn().mockReturnValue({ enabled: true, loading: false }),
}));

vi.mock("@/onboarding/checklist", () => ({
  computeOnboardingChecklist: vi.fn(),
  markHomeSeen: vi.fn(),
}));

vi.mock("@/demo/demoData", () => ({
  seedDemoData: vi.fn(),
}));

vi.mock("@/notifications/NotificationContext", () => ({
  useNotifications: () => ({ notify: vi.fn() }),
}));
vi.mock("@/api/bagStatsClient", () => ({ fetchBagStats: vi.fn() }));
vi.mock("@web/bag/storage", () => ({
  loadBag: vi.fn(),
}));
vi.mock("@/practice/practiceMissionHistory", () => ({
  PRACTICE_MISSION_WINDOW_DAYS: 7,
  loadPracticeMissionHistory: vi.fn(),
}));
vi.mock("@/practice/analytics", () => ({
  trackPracticePlanCompletedViewed: vi.fn(),
  trackWeeklyPracticeGoalSettingsUpdated: vi.fn((payload) =>
    buildWeeklyPracticeGoalSettingsUpdatedEvent(payload),
  ),
  trackPracticeGoalNudgeShown: vi.fn(),
  trackPracticeGoalNudgeClicked: vi.fn(),
}));
vi.mock("@/practice/practiceGoalSettings", () => ({
  loadWeeklyPracticeGoalSettings: vi.fn(),
  saveWeeklyPracticeGoalSettings: vi.fn(),
}));
vi.mock("@shared/experiments/flags", () => ({
  isInExperiment: vi.fn().mockReturnValue(true),
  getExperimentBucket: vi.fn().mockReturnValue(24),
  getExperimentVariant: vi.fn().mockReturnValue("treatment"),
}));

import { useAccessFeatures, useAccessPlan, useFeatureFlag } from "@/access/UserAccessContext";
import {
  computeOnboardingChecklist,
  markHomeSeen,
  type OnboardingChecklist,
} from "@/onboarding/checklist";
import { seedDemoData } from "@/demo/demoData";
import { buildWeeklyGoalStreak } from "@shared/practice/practiceGoals";
import {
  trackPracticePlanCompletedViewed,
  trackPracticeGoalNudgeClicked,
  trackPracticeGoalNudgeShown,
  trackWeeklyPracticeGoalSettingsUpdated,
} from "@/practice/analytics";
import {
  loadWeeklyPracticeGoalSettings,
  saveWeeklyPracticeGoalSettings,
} from "@/practice/practiceGoalSettings";

const mockUseAccessPlan = useAccessPlan as unknown as Mock;
const mockUseAccessFeatures = useAccessFeatures as unknown as Mock;
const mockUseFeatureFlag = useFeatureFlag as unknown as Mock;
const mockComputeOnboardingChecklist =
  computeOnboardingChecklist as unknown as Mock;
const mockMarkHomeSeen = markHomeSeen as unknown as Mock;
const mockSeedDemoData = seedDemoData as unknown as Mock;
const mockFetchBagStats = bagStatsApi.fetchBagStats as unknown as Mock;
const mockLoadBag = loadBag as unknown as Mock;
const mockLoadPracticeHistory =
  loadPracticeMissionHistory as unknown as Mock;
const mockTrackPlanCompletedViewed =
  trackPracticePlanCompletedViewed as unknown as Mock;
const mockTrackGoalSettingsUpdated =
  trackWeeklyPracticeGoalSettingsUpdated as unknown as Mock;
const mockTrackGoalNudgeShown =
  trackPracticeGoalNudgeShown as unknown as Mock;
const mockTrackGoalNudgeClicked =
  trackPracticeGoalNudgeClicked as unknown as Mock;
const mockLoadWeeklyGoalSettings =
  loadWeeklyPracticeGoalSettings as unknown as Mock;
const mockSaveWeeklyGoalSettings =
  saveWeeklyPracticeGoalSettings as unknown as Mock;
const mockIsInExperiment = experiments.isInExperiment as unknown as Mock;
const mockGetExperimentBucket = experiments.getExperimentBucket as unknown as Mock;
const mockGetExperimentVariant = experiments.getExperimentVariant as unknown as Mock;
let dateNowSpy: ReturnType<typeof vi.spyOn>;

const mockBagStats: BagClubStatsMap = {
  '9i': { clubId: '9i', meanDistanceM: 120, sampleCount: 8 },
  '7i': { clubId: '7i', meanDistanceM: 140, sampleCount: 8 },
  '5i': { clubId: '5i', meanDistanceM: 160, sampleCount: 8 },
};

const baseChecklist: OnboardingChecklist = {
  allDone: false,
  tasks: [
    { id: "HOME_VISITED", labelKey: "onboarding.task.home", done: false },
    { id: "PLAYED_QUICKROUND", labelKey: "onboarding.task.quick", done: false },
    { id: "PLAYED_RANGE", labelKey: "onboarding.task.range", done: false },
    { id: "VIEWED_PROFILE", labelKey: "onboarding.task.profile", done: false },
  ],
};

const renderHome = () => {
  return render(
    <MemoryRouter>
      <UnitsProvider>
        <HomeHubPage />
      </UnitsProvider>
    </MemoryRouter>,
  );
};

describe("HomeHubPage", () => {
  beforeEach(() => {
    dateNowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2024-02-08T12:00:00Z").getTime());
    mockUseAccessPlan.mockReturnValue({
      plan: "free",
      isPro: false,
      isFree: true,
      trial: null,
      expiresAt: null,
      loading: false,
      refresh: vi.fn(),
      error: undefined,
    });
    mockUseAccessFeatures.mockReturnValue({
      hasFeature: vi.fn().mockReturnValue(true),
      hasPlanFeature: vi.fn().mockReturnValue(false),
      loading: false,
    });
    mockUseFeatureFlag.mockReturnValue({ enabled: true, loading: false });
    mockComputeOnboardingChecklist.mockReturnValue({ ...baseChecklist });
    mockMarkHomeSeen.mockClear();
    mockSeedDemoData.mockClear();
    mockLoadBag.mockReturnValue(createDefaultBag());
    mockFetchBagStats.mockResolvedValue(mockBagStats);
    mockLoadPracticeHistory.mockResolvedValue([]);
    mockTrackPlanCompletedViewed.mockClear();
    mockTrackGoalNudgeShown.mockClear();
    mockTrackGoalNudgeClicked.mockClear();
    mockLoadWeeklyGoalSettings.mockReturnValue({ targetMissionsPerWeek: 3 });
    mockSaveWeeklyGoalSettings.mockClear();
    mockIsInExperiment.mockReturnValue(true);
    mockGetExperimentBucket.mockReturnValue(24);
    mockGetExperimentVariant.mockReturnValue("treatment");
  });

  afterEach(() => {
    dateNowSpy?.mockRestore();
    vi.clearAllMocks();
    cleanup();
  });

  it("renders home hub with entry cards and free plan badge", () => {
    renderHome();

    expect(screen.getByText(/GolfIQ Home/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Start Quick Round/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open range practice/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /View My GolfIQ/i })).toBeTruthy();
    expect(screen.getAllByText(/Free/i).length).toBeGreaterThan(0);
  });

  it("prefers backend plan when available to show pro state", async () => {
    mockUseAccessPlan.mockReturnValue({
      plan: "pro",
      isPro: true,
      isFree: false,
      trial: null,
      expiresAt: null,
      loading: false,
      refresh: vi.fn(),
      error: undefined,
    });
    mockUseAccessFeatures.mockReturnValue({
      hasFeature: vi.fn().mockReturnValue(true),
      hasPlanFeature: vi.fn().mockReturnValue(true),
      loading: false,
    });

    renderHome();

    expect(screen.getAllByText(/Pro/i).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Caddie insights unlocked/i)).toBeTruthy();
  });

  it("falls back to local plan when backend plan is not loaded", () => {
    mockUseAccessPlan.mockReturnValue({
      plan: "free",
      isPro: false,
      isFree: true,
      trial: null,
      expiresAt: null,
      loading: true,
      refresh: vi.fn(),
      error: undefined,
    });

    renderHome();

    expect(screen.getAllByText(/Free/i).length).toBeGreaterThan(0);
  });

  it("shows onboarding checklist and handles demo seed action", async () => {
    renderHome();

    expect(mockMarkHomeSeen).toHaveBeenCalled();

    const [demoButton] = await screen.findAllByTestId("seed-demo-data");
    fireEvent.click(demoButton);
    expect(mockSeedDemoData).toHaveBeenCalled();
  });

  it("shows bag readiness score and suggestion", async () => {
    mockFetchBagStats.mockResolvedValue({
      ...mockBagStats,
      driver: { clubId: "driver", meanDistanceM: 230, sampleCount: 3 },
    });

    renderHome();

    const tiles = await screen.findAllByTestId("home-bag-readiness");
    expect(tiles[0]).toBeVisible();
    const scores = await screen.findAllByTestId("home-bag-readiness-score");
    expect(scores[0].textContent).toMatch(/\d{1,3}\/100/);
    const suggestions = await screen.findAllByTestId("home-bag-readiness-suggestion");
    expect(suggestions[0].textContent).toMatch(/Förslag|Suggestion/);
  });

  it("handles missing stats gracefully", async () => {
    mockFetchBagStats.mockResolvedValue({});

    renderHome();

    const tiles = await screen.findAllByTestId("home-bag-readiness");
    expect(tiles[0]).toBeVisible();
    expect((await screen.findAllByText(/Bag readiness/i))[0]).toBeVisible();
  });

  it("shows a completed weekly practice plan on the home tile and emits analytics", async () => {
    const now = new Date("2024-02-06T10:00:00Z");
    mockLoadBag.mockReturnValue({ updatedAt: now.getTime(), clubs: [] });
    mockLoadPracticeHistory.mockResolvedValue([
      {
        id: "entry-1",
        missionId: "mission-1",
        startedAt: now.toISOString(),
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "entry-2",
        missionId: "mission-2",
        startedAt: now.toISOString(),
        status: "completed",
        targetClubs: [],
        completedSampleCount: 8,
      },
    ]);

    renderHome();

    expect(await screen.findByTestId("practice-plan-summary")).toHaveTextContent(
      "Weekly plan: done 🎉",
    );

    await waitFor(() => {
      expect(mockTrackPlanCompletedViewed).toHaveBeenCalledWith({
        entryPoint: "home",
        completedMissions: 2,
        totalMissions: 2,
        isPlanCompleted: true,
        targetMissionsPerWeek: 3,
      });
    });
  });

  it("shows partial weekly plan progress on the home practice tile", async () => {
    const now = new Date("2024-02-06T10:00:00Z");
    mockLoadBag.mockReturnValue({ updatedAt: now.getTime(), clubs: [] });
    mockLoadPracticeHistory.mockResolvedValue([
      {
        id: "entry-1",
        missionId: "mission-1",
        startedAt: now.toISOString(),
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "entry-2",
        missionId: "mission-2",
        startedAt: now.toISOString(),
        status: "abandoned",
        targetClubs: [],
        completedSampleCount: 0,
      },
    ]);

    renderHome();

    expect(await screen.findByTestId("practice-plan-summary")).toHaveTextContent(
      "Weekly plan: 1 of 2 missions done",
    );
    expect(mockTrackPlanCompletedViewed).not.toHaveBeenCalled();
  });

  it("shows weekly practice goal prompt when no history exists", async () => {
    renderHome();

    await waitFor(() => {
      expect(mockLoadPracticeHistory).toHaveBeenCalled();
    });

    const summaries = await screen.findAllByText(
      "Start your first practice mission this week.",
    );
    expect(summaries.length).toBeGreaterThan(0);
    expect(
      document.querySelector('[data-testid="practice-goal-status"]'),
    ).toBeNull();
  });

  it("shows catch-up status when behind weekly practice goal", async () => {
    mockLoadPracticeHistory.mockImplementation(async () => [
      {
        id: "e1",
        missionId: "m1",
        startedAt: "2024-02-05T10:00:00Z",
        endedAt: "2024-02-05T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "e2",
        missionId: "m2",
        startedAt: "2024-02-07T10:00:00Z",
        endedAt: "2024-02-07T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);

    renderHome();

    await waitFor(() => {
      expect(mockLoadPracticeHistory).toHaveBeenCalled();
    });

    const loadedHistory = await mockLoadPracticeHistory.mock.results[0].value;
    expect(loadedHistory).toHaveLength(2);

    const summaries = await screen.findAllByText("2/3 missions this week");
    const statuses = await screen.findAllByText("Catch up");

    expect(summaries.length).toBeGreaterThan(0);
    expect(statuses.length).toBeGreaterThan(0);
  });

  it("uses stored weekly goal target on the practice tile", async () => {
    mockLoadWeeklyGoalSettings.mockReturnValue({ targetMissionsPerWeek: 5 });
    mockLoadPracticeHistory.mockResolvedValue([
      {
        id: "g1",
        missionId: "m1",
        startedAt: "2024-02-05T10:00:00Z",
        endedAt: "2024-02-05T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "g2",
        missionId: "m2",
        startedAt: "2024-02-06T10:00:00Z",
        endedAt: "2024-02-06T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);

    renderHome();

    await waitFor(() => {
      expect(screen.getByTestId("practice-goal-summary")).toHaveTextContent(
        "2/5 missions this week",
      );
    });
  });

  it("lets players edit their weekly goal from home", async () => {
    mockLoadWeeklyGoalSettings.mockReturnValue({ targetMissionsPerWeek: 3 });
    mockLoadPracticeHistory.mockResolvedValue([
      {
        id: "g1",
        missionId: "m1",
        startedAt: "2024-02-05T10:00:00Z",
        endedAt: "2024-02-05T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);

    renderHome();

    fireEvent.click(await screen.findByTestId("practice-goal-edit"));
    const option = await screen.findByTestId("practice-goal-option-5");
    fireEvent.click(option);

    expect(mockSaveWeeklyGoalSettings).toHaveBeenCalledWith({ targetMissionsPerWeek: 5 });
    expect(await screen.findByTestId("practice-goal-summary")).toHaveTextContent(
      "1/5 missions this week",
    );
    expect(mockTrackGoalSettingsUpdated).toHaveBeenCalledWith({
      previousTarget: 3,
      newTarget: 5,
      source: "web_home_inline",
    });
    expect(mockTrackGoalSettingsUpdated.mock.results[0]?.value).toEqual({
      previousTarget: 3,
      newTarget: 5,
      source: "web_home_inline",
      isDefaultBefore: true,
      isDefaultAfter: false,
    });
  });

  it("does not emit goal settings analytics on no-op edits", async () => {
    mockLoadWeeklyGoalSettings.mockReturnValue({ targetMissionsPerWeek: 5 });
    mockLoadPracticeHistory.mockResolvedValue([]);

    renderHome();

    fireEvent.click(await screen.findByTestId("practice-goal-edit"));
    const option = await screen.findByTestId("practice-goal-option-5");
    fireEvent.click(option);

    expect(mockTrackGoalSettingsUpdated).not.toHaveBeenCalled();
  });

  it("shows on-track status when weekly goal is met", async () => {
    mockLoadPracticeHistory.mockImplementation(async () => [
      {
        id: "e1",
        missionId: "m1",
        startedAt: "2024-02-04T10:00:00Z",
        endedAt: "2024-02-04T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "e2",
        missionId: "m2",
        startedAt: "2024-02-06T10:00:00Z",
        endedAt: "2024-02-06T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "e3",
        missionId: "m3",
        startedAt: "2024-02-07T10:00:00Z",
        endedAt: "2024-02-07T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);

    renderHome();

    await waitFor(() => {
      expect(mockLoadPracticeHistory).toHaveBeenCalled();
    });

    const loadedHistory = await mockLoadPracticeHistory.mock.results[0].value;
    expect(loadedHistory).toHaveLength(3);

    const summaries = await screen.findAllByText("3/3 missions this week");
    const statuses = await screen.findAllByText(/weekly goal complete/i);

    expect(summaries.length).toBeGreaterThan(0);
    expect(statuses.length).toBeGreaterThan(0);
  });

  it("shows a weekly streak label when consecutive weeks meet the goal", async () => {
    mockLoadPracticeHistory.mockImplementation(async () => [
      {
        id: "c1",
        missionId: "m1",
        startedAt: "2024-02-05T10:00:00Z",
        endedAt: "2024-02-05T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "c2",
        missionId: "m2",
        startedAt: "2024-02-06T10:00:00Z",
        endedAt: "2024-02-06T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "c3",
        missionId: "m3",
        startedAt: "2024-02-07T10:00:00Z",
        endedAt: "2024-02-07T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "p1",
        missionId: "m4",
        startedAt: "2024-01-30T10:00:00Z",
        endedAt: "2024-01-30T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "p2",
        missionId: "m5",
        startedAt: "2024-01-31T10:00:00Z",
        endedAt: "2024-01-31T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "p3",
        missionId: "m6",
        startedAt: "2024-02-01T10:00:00Z",
        endedAt: "2024-02-01T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);

    renderHome();

    expect(await screen.findByText(/week streak/i)).toBeTruthy();
  });

  it("computes streaks based on the stored weekly goal target", async () => {
    mockLoadWeeklyGoalSettings.mockReturnValue({ targetMissionsPerWeek: 5 });
    mockLoadPracticeHistory.mockImplementation(async () => [
      {
        id: "c1",
        missionId: "m1",
        startedAt: "2024-02-05T10:00:00Z",
        endedAt: "2024-02-05T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "c2",
        missionId: "m2",
        startedAt: "2024-02-06T10:00:00Z",
        endedAt: "2024-02-06T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "c3",
        missionId: "m3",
        startedAt: "2024-02-07T10:00:00Z",
        endedAt: "2024-02-07T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "p1",
        missionId: "m4",
        startedAt: "2024-01-30T10:00:00Z",
        endedAt: "2024-01-30T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "p2",
        missionId: "m5",
        startedAt: "2024-01-31T10:00:00Z",
        endedAt: "2024-01-31T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "p3",
        missionId: "m6",
        startedAt: "2024-02-01T10:00:00Z",
        endedAt: "2024-02-01T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);

    renderHome();

    await screen.findAllByTestId("practice-goal-summary");
    expect(screen.queryByText(/week streak/i)).toBeNull();
  });

  it("hides the streak label when the run is shorter than two weeks", async () => {
    mockLoadPracticeHistory.mockImplementation(async () => [
      {
        id: "c1",
        missionId: "m1",
        startedAt: "2024-02-05T10:00:00Z",
        endedAt: "2024-02-05T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "c2",
        missionId: "m2",
        startedAt: "2024-02-06T10:00:00Z",
        endedAt: "2024-02-06T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "c3",
        missionId: "m3",
        startedAt: "2024-02-07T10:00:00Z",
        endedAt: "2024-02-07T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);

    renderHome();

    const loadedHistory = await mockLoadPracticeHistory.mock.results[0].value;
    expect(loadedHistory).toEqual([
      {
        id: "c1",
        missionId: "m1",
        startedAt: "2024-02-05T10:00:00Z",
        endedAt: "2024-02-05T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "c2",
        missionId: "m2",
        startedAt: "2024-02-06T10:00:00Z",
        endedAt: "2024-02-06T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "c3",
        missionId: "m3",
        startedAt: "2024-02-07T10:00:00Z",
        endedAt: "2024-02-07T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);
    expect(
      buildWeeklyGoalStreak({ history: loadedHistory, now: new Date(Date.now()) }).currentStreakWeeks,
    ).toBe(1);

    await screen.findAllByTestId("practice-goal-summary");
    expect(screen.queryByText(/week streak/i)).toBeNull();
  });

  it("shows a weekly goal nudge when close to completion and in experiment", async () => {
    mockLoadPracticeHistory.mockResolvedValue([
      {
        id: "n1",
        missionId: "m1",
        startedAt: "2024-02-05T10:00:00Z",
        endedAt: "2024-02-05T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "n2",
        missionId: "m2",
        startedAt: "2024-02-06T10:00:00Z",
        endedAt: "2024-02-06T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);

    renderHome();

    expect(await screen.findByTestId("practice-goal-nudge")).toBeTruthy();
    expect(mockTrackGoalNudgeShown).toHaveBeenCalledWith(
      expect.objectContaining({ experimentBucket: 24, surface: "web_home" }),
    );

    fireEvent.click(screen.getByTestId("practice-goal-nudge-cta"));

    expect(mockTrackGoalNudgeClicked).toHaveBeenCalledWith(
      expect.objectContaining({ cta: "practice_missions" }),
    );
  });

  it("hides the nudge when the goal is already complete", async () => {
    mockLoadPracticeHistory.mockResolvedValue([
      {
        id: "n1",
        missionId: "m1",
        startedAt: "2024-02-05T10:00:00Z",
        endedAt: "2024-02-05T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "n2",
        missionId: "m2",
        startedAt: "2024-02-06T10:00:00Z",
        endedAt: "2024-02-06T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: "n3",
        missionId: "m3",
        startedAt: "2024-02-07T10:00:00Z",
        endedAt: "2024-02-07T10:20:00Z",
        status: "completed",
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);

    renderHome();

    await screen.findAllByTestId("practice-goal-summary");
    expect(screen.queryByTestId("practice-goal-nudge")).toBeNull();
    expect(mockTrackGoalNudgeShown).not.toHaveBeenCalled();
  });
});
