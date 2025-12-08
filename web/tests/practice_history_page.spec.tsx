import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import PracticeHistoryPage from "@/pages/practice/PracticeHistoryPage";
import { HomeHubPage } from "@/pages/home/HomeHubPage";
import { UnitsProvider } from "@/preferences/UnitsContext";
import type { PracticeMissionHistoryEntry } from "@shared/practice/practiceHistory";
import { createDefaultBag } from "@/bag/types";

vi.mock("@/practice/practiceMissionHistory", () => ({
  loadPracticeMissionHistory: vi.fn(),
  PRACTICE_MISSION_WINDOW_DAYS: 14,
}));

vi.mock("@/bag/storage", () => ({
  loadBag: vi.fn(),
}));

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

import { loadPracticeMissionHistory } from "@/practice/practiceMissionHistory";
import { loadBag } from "@/bag/storage";
import { useAccessFeatures, useAccessPlan, useFeatureFlag } from "@/access/UserAccessContext";
import { computeOnboardingChecklist, markHomeSeen } from "@/onboarding/checklist";
import { seedDemoData } from "@/demo/demoData";
import * as bagStatsApi from "@/api/bagStatsClient";

const mockLoadHistory = loadPracticeMissionHistory as unknown as Mock;
const mockLoadBag = loadBag as unknown as Mock;
const mockUseAccessPlan = useAccessPlan as unknown as Mock;
const mockUseAccessFeatures = useAccessFeatures as unknown as Mock;
const mockUseFeatureFlag = useFeatureFlag as unknown as Mock;
const mockComputeOnboardingChecklist = computeOnboardingChecklist as unknown as Mock;
const mockMarkHomeSeen = markHomeSeen as unknown as Mock;
const mockSeedDemoData = seedDemoData as unknown as Mock;
const mockFetchBagStats = bagStatsApi.fetchBagStats as unknown as Mock;

const baseChecklist = {
  allDone: false,
  tasks: [
    { id: "HOME_VISITED", labelKey: "onboarding.task.home", done: false },
    { id: "PLAYED_QUICKROUND", labelKey: "onboarding.task.quick", done: false },
    { id: "PLAYED_RANGE", labelKey: "onboarding.task.range", done: false },
    { id: "VIEWED_PROFILE", labelKey: "onboarding.task.profile", done: false },
  ],
};

describe("PracticeHistoryPage", () => {
  beforeEach(() => {
    mockLoadBag.mockReturnValue(createDefaultBag());
    mockLoadHistory.mockResolvedValue([]);
  });

  it("renders empty state when no history is available", async () => {
    render(
      <MemoryRouter>
        <PracticeHistoryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("practice-history-empty")).toBeVisible();
    expect(screen.getByRole("link", { name: /Start practice/i })).toBeVisible();
  });

  it("renders mission rows with counts, status and streak tag", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const history: PracticeMissionHistoryEntry[] = [
      {
        id: "first",
        missionId: "mission-a",
        startedAt: yesterday.toISOString(),
        endedAt: yesterday.toISOString(),
        status: "completed",
        targetClubs: ["7i", "9i"],
        targetSampleCount: 30,
        completedSampleCount: 24,
      },
      {
        id: "second",
        missionId: "mission-a",
        startedAt: now.toISOString(),
        endedAt: now.toISOString(),
        status: "abandoned",
        targetClubs: ["7i"],
        targetSampleCount: 20,
        completedSampleCount: 10,
      },
    ];

    mockLoadBag.mockReturnValue({
      updatedAt: now.getTime(),
      clubs: [
        { id: "7i", label: "7-iron", carry_m: null },
        { id: "9i", label: "9-iron", carry_m: null },
      ],
    });
    mockLoadHistory.mockResolvedValue(history);

    render(
      <MemoryRouter>
        <PracticeHistoryPage />
      </MemoryRouter>,
    );

    const list = await screen.findByTestId("practice-history-list");
    const rows = within(list).getAllByTestId("practice-history-item");
    expect(rows).toHaveLength(2);

    const formattedDate = new Date(yesterday.toISOString()).toLocaleDateString("en", {
      month: "short",
      day: "numeric",
    });
    expect(screen.getByText(formattedDate)).toBeVisible();
    expect(screen.getByText(/7-iron, 9-iron/)).toBeVisible();
    expect(screen.getByText(/24 \/ 30 swings/)).toBeVisible();
    expect(screen.getByText(/Completed/i)).toBeVisible();
    expect(screen.getByText(/Streak day/i)).toBeVisible();
  });
});

describe("Practice history navigation", () => {
  beforeEach(() => {
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
    mockFetchBagStats.mockResolvedValue({});
    mockLoadHistory.mockResolvedValue([]);
    mockLoadBag.mockReturnValue(createDefaultBag());
  });

  it("navigates from home hub link to practice history", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <UnitsProvider>
          <Routes>
            <Route path="/" element={<HomeHubPage />} />
            <Route path="/practice/history" element={<PracticeHistoryPage />} />
          </Routes>
        </UnitsProvider>
      </MemoryRouter>,
    );

    const historyLink = await screen.findByTestId("home-practice-history-link");
    fireEvent.click(historyLink);

    const headings = await screen.findAllByRole("heading", { level: 1, name: /Practice history/i });
    expect(headings.length).toBeGreaterThan(0);
  });
});
