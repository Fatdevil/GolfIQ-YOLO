import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import userEvent from "@testing-library/user-event";

import PracticeMissionsPage from "@/pages/practice/PracticeMissionsPage";
import { HomeHubPage } from "@/pages/home/HomeHubPage";
import type { PracticeMissionHistoryEntry } from "@shared/practice/practiceHistory";
import { createDefaultBag } from "@/bag/types";
import { UnitsProvider } from "@/preferences/UnitsContext";
import { useAccessFeatures, useAccessPlan, useFeatureFlag } from "@/access/UserAccessContext";
import { computeOnboardingChecklist, markHomeSeen } from "@/onboarding/checklist";
import { seedDemoData } from "@/demo/demoData";

vi.mock("@/practice/practiceMissionHistory", async () => {
  const actual = await vi.importActual<typeof import("@/practice/practiceMissionHistory")>(
    "@/practice/practiceMissionHistory",
  );

  return {
    ...actual,
    loadPracticeMissionHistory: vi.fn(),
  };
});

vi.mock("@/bag/storage", () => ({
  loadBag: vi.fn(),
}));

vi.mock("@/bag/utils", () => ({
  mapBagStateToPlayerBag: vi.fn(),
}));

vi.mock("@shared/caddie/bagReadiness", () => ({
  buildBagReadinessOverview: vi.fn(),
}));

vi.mock("@/api/bagStatsClient", () => ({ fetchBagStats: vi.fn() }));

vi.mock("@/api", async () => {
  const actual = await vi.importActual<typeof import("@/api")>("@/api");
  return {
    ...actual,
    postTelemetryEvent: vi.fn(),
  };
});

vi.mock("@/access/UserAccessContext", () => ({
  useAccessPlan: vi.fn().mockReturnValue({ isPro: true, isFree: false, loading: false }),
  useAccessFeatures: vi.fn().mockReturnValue({
    hasFeature: vi.fn().mockReturnValue(true),
    hasPlanFeature: vi.fn().mockReturnValue(true),
    loading: false,
  }),
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
  useNotifications: vi.fn(() => ({ notify: vi.fn() })),
}));

import { loadPracticeMissionHistory } from "@/practice/practiceMissionHistory";
import { loadBag } from "@/bag/storage";
import { mapBagStateToPlayerBag } from "@/bag/utils";
import { buildBagReadinessOverview } from "@shared/caddie/bagReadiness";
import { fetchBagStats } from "@/api/bagStatsClient";
import { useNotifications } from "@/notifications/NotificationContext";
import { postTelemetryEvent } from "@/api";

const mockLoadHistory = loadPracticeMissionHistory as unknown as Mock;
const mockLoadBag = loadBag as unknown as Mock;
const mockMapBagToPlayer = mapBagStateToPlayerBag as unknown as Mock;
const mockBuildBagReadiness = buildBagReadinessOverview as unknown as Mock;
const mockFetchBagStats = fetchBagStats as unknown as Mock;
const mockUseAccessPlan = useAccessPlan as unknown as Mock;
const mockUseAccessFeatures = useAccessFeatures as unknown as Mock;
const mockUseFeatureFlag = useFeatureFlag as unknown as Mock;
const mockComputeOnboardingChecklist = computeOnboardingChecklist as unknown as Mock;
const mockMarkHomeSeen = markHomeSeen as unknown as Mock;
const mockSeedDemoData = seedDemoData as unknown as Mock;
const mockUseNotifications = useNotifications as unknown as Mock;
const mockTelemetry = postTelemetryEvent as unknown as Mock;

const baseChecklist = {
  allDone: false,
  tasks: [
    { id: "HOME_VISITED", labelKey: "onboarding.task.home", done: false },
    { id: "PLAYED_QUICKROUND", labelKey: "onboarding.task.quick", done: false },
    { id: "PLAYED_RANGE", labelKey: "onboarding.task.range", done: false },
    { id: "VIEWED_PROFILE", labelKey: "onboarding.task.profile", done: false },
  ],
};

function renderWithRouter(initialEntries: string[] = ["/practice/missions"]) {
  return render(
    <UnitsProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/practice/missions" element={<PracticeMissionsPage />} />
          <Route path="/practice/history/:id" element={<DetailSpy />} />
          <Route path="/" element={<HomeHubPage />} />
        </Routes>
      </MemoryRouter>
    </UnitsProvider>,
  );
}

function DetailSpy() {
  const params = useParams();
  return <div data-testid="mission-detail-route">detail {params.id}</div>;
}

describe("PracticeMissionsPage", () => {
  beforeEach(() => {
    mockLoadHistory.mockReset();
    mockLoadBag.mockReset();
    mockMapBagToPlayer.mockReset();
    mockFetchBagStats.mockReset();
    mockBuildBagReadiness.mockReset();
    mockTelemetry.mockReset();
    mockLoadBag.mockReturnValue(createDefaultBag());
    mockMapBagToPlayer.mockReturnValue({ clubs: [] });
    mockFetchBagStats.mockResolvedValue({});
    mockBuildBagReadiness.mockReturnValue({
      readiness: { grade: "poor", score: 20, calibratedClubs: 0, needsMoreSamplesCount: 0, noDataCount: 0, totalClubs: 0, largeGapCount: 0, overlapCount: 0 },
      suggestions: [
        { id: "suggestion-1", type: "fill_gap", lowerClubId: "7i", upperClubId: "8i", severity: "high" },
      ],
      dataStatusByClubId: {},
    });
  });

  it("fires practice_missions_viewed when the page mounts", async () => {
    mockLoadHistory.mockResolvedValue([]);

    renderWithRouter(["/practice/missions?source=home_hub"]);

    await screen.findByTestId("practice-missions-page");

    await waitFor(() => {
      expect(mockTelemetry).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "practice_missions_viewed",
          surface: "web",
          source: "home_hub",
        }),
      );
      expect(mockTelemetry).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "practice_plan_viewed",
          entryPoint: "practice_missions",
        }),
      );
    });
  });

  it("tracks mission start when a mission CTA is clicked", async () => {
    mockLoadHistory.mockResolvedValue([]);

    renderWithRouter();

    const list = await screen.findByTestId("practice-missions-list");
    const rows = within(list).getAllByTestId("practice-mission-item");

    await userEvent.click(rows[0]);

    expect(mockTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "practice_plan_mission_start",
        missionId: "practice_fill_gap:7i:8i",
        planRank: 1,
      }),
    );
    expect(mockTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "practice_mission_start",
        missionId: "practice_fill_gap:7i:8i",
        sourceSurface: "missions_page",
      }),
    );
  });

  it("renders a weekly plan and separates remaining missions", async () => {
    mockLoadHistory.mockResolvedValue([
      { id: "entry-1", missionId: "mission-a", startedAt: "2024-02-01T00:00:00Z", status: "completed" },
      { id: "entry-2", missionId: "mission-b", startedAt: "2024-02-02T00:00:00Z", status: "completed" },
      { id: "entry-3", missionId: "mission-c", startedAt: "2024-02-03T00:00:00Z", status: "completed" },
      { id: "entry-4", missionId: "mission-d", startedAt: "2024-02-04T00:00:00Z", status: "completed" },
    ] as PracticeMissionHistoryEntry[]);

    renderWithRouter();

    const plan = await screen.findByTestId("practice-weekly-plan");
    expect(plan).toBeVisible();
    expect(within(plan).getAllByTestId("practice-plan-item").length).toBeGreaterThanOrEqual(1);

    const [remaining] = await screen.findAllByTestId("practice-missions-remaining");
    const remainingItems = within(remaining).queryAllByTestId("practice-mission-item");

    const [list] = await screen.findAllByTestId("practice-missions-list");
    const all = within(list).getAllByTestId("practice-mission-item");
    const uniqueIds = new Set(all.map((item: HTMLElement) => item.getAttribute("data-testid")));
    expect(uniqueIds.size).toEqual(all.length);
    expect(all.length).toEqual(within(plan).getAllByTestId("practice-mission-item").length + remainingItems.length);
  });

  it("renders prioritized missions with status labels", async () => {
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const history: PracticeMissionHistoryEntry[] = [
      {
        id: "entry-1",
        missionId: "practice_fill_gap:7i:8i",
        startedAt: tenDaysAgo.toISOString(),
        endedAt: tenDaysAgo.toISOString(),
        status: "completed",
        targetClubs: [],
        targetSampleCount: undefined,
        completedSampleCount: 0,
      },
      {
        id: "entry-2",
        missionId: "mission-b",
        startedAt: yesterday.toISOString(),
        endedAt: yesterday.toISOString(),
        status: "completed",
        targetClubs: [],
        targetSampleCount: undefined,
        completedSampleCount: 0,
      },
      {
        id: "entry-3",
        missionId: "mission-c",
        startedAt: fiveDaysAgo.toISOString(),
        endedAt: undefined,
        status: "abandoned",
        targetClubs: [],
        targetSampleCount: undefined,
        completedSampleCount: 0,
      },
    ];
    mockLoadHistory.mockResolvedValue(history);

    renderWithRouter();

    const [list] = await screen.findAllByTestId("practice-missions-list");
    const rows = within(list).getAllByTestId("practice-mission-item");
    expect(rows.length).toBeGreaterThan(0);

    expect(rows[0].textContent).toMatch(/Practice gapping/);
    expect(rows[0].textContent).toMatch(/High priority|Recommended/);
  });

  it("shows empty state when there are no missions", async () => {
    mockLoadHistory.mockResolvedValue([]);
    mockBuildBagReadiness.mockReturnValue({ readiness: { grade: "poor", score: 0, calibratedClubs: 0, needsMoreSamplesCount: 0, noDataCount: 0, totalClubs: 0, largeGapCount: 0, overlapCount: 0 }, suggestions: [], dataStatusByClubId: {} });

    renderWithRouter();

    expect(await screen.findByTestId("practice-missions-empty")).toBeVisible();
    expect(screen.getByText(/No missions yet/i)).toBeVisible();
  });

  it("navigates to mission detail when a mission is selected", async () => {
    const history: PracticeMissionHistoryEntry[] = [
      {
        id: "entry-old",
        missionId: "mission-nav",
        startedAt: "2024-02-01T00:00:00Z",
        endedAt: "2024-02-01T00:00:00Z",
        status: "completed",
        targetClubs: [],
        targetSampleCount: undefined,
        completedSampleCount: 0,
      },
      {
        id: "entry-latest",
        missionId: "mission-nav",
        startedAt: "2024-02-14T00:00:00Z",
        endedAt: "2024-02-14T00:00:00Z",
        status: "completed",
        targetClubs: [],
        targetSampleCount: undefined,
        completedSampleCount: 0,
      },
    ];
    mockLoadHistory.mockResolvedValue(history);
    mockBuildBagReadiness.mockReturnValue({ readiness: { grade: "poor", score: 0, calibratedClubs: 0, needsMoreSamplesCount: 0, noDataCount: 0, totalClubs: 0, largeGapCount: 0, overlapCount: 0 }, suggestions: [], dataStatusByClubId: {} });

    renderWithRouter();

    const title = await screen.findByText("mission-nav");
    const missionRow = title.closest('[data-testid="practice-mission-item"]');
    expect(missionRow).not.toBeNull();
    await userEvent.click(missionRow!);

    expect(await screen.findByTestId("mission-detail-route")).toHaveTextContent("entry-latest");
  });
});

describe("Practice missions navigation", () => {
  beforeEach(() => {
    mockLoadHistory.mockReset();
    mockLoadBag.mockReset();
    mockMapBagToPlayer.mockReset();
    mockBuildBagReadiness.mockReset();
    mockFetchBagStats.mockReset();
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
    mockTelemetry.mockReset();
    mockUseNotifications.mockReturnValue({ notify: vi.fn() });
    mockLoadHistory.mockResolvedValue([]);
    mockLoadBag.mockReturnValue(createDefaultBag());
    mockMapBagToPlayer.mockReturnValue({ clubs: [] });
    mockBuildBagReadiness.mockReturnValue({ readiness: { grade: "poor", score: 0, calibratedClubs: 0, needsMoreSamplesCount: 0, noDataCount: 0, totalClubs: 0, largeGapCount: 0, overlapCount: 0 }, suggestions: [], dataStatusByClubId: {} });
    mockFetchBagStats.mockResolvedValue({});
  });

  it("navigates from home CTA to practice missions", async () => {
    renderWithRouter(["/"]);

    const link = await screen.findByTestId("home-practice-missions-link");
    await userEvent.click(link);

    const pages = await screen.findAllByTestId("practice-missions-page");
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]).toBeVisible();
  });
});
