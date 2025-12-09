import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { HomeHubPage } from "@/pages/home/HomeHubPage";
import * as bagStatsApi from "@/api/bagStatsClient";
import { UnitsProvider } from "@/preferences/UnitsContext";
import type { BagClubStatsMap } from "@shared/caddie/bagStats";
import { loadPracticeMissionHistory } from "@/practice/practiceMissionHistory";

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
vi.mock("@/practice/practiceMissionHistory", () => ({
  loadPracticeMissionHistory: vi.fn(),
}));

import { useAccessFeatures, useAccessPlan, useFeatureFlag } from "@/access/UserAccessContext";
import {
  computeOnboardingChecklist,
  markHomeSeen,
  type OnboardingChecklist,
} from "@/onboarding/checklist";
import { seedDemoData } from "@/demo/demoData";

const mockUseAccessPlan = useAccessPlan as unknown as Mock;
const mockUseAccessFeatures = useAccessFeatures as unknown as Mock;
const mockUseFeatureFlag = useFeatureFlag as unknown as Mock;
const mockComputeOnboardingChecklist =
  computeOnboardingChecklist as unknown as Mock;
const mockMarkHomeSeen = markHomeSeen as unknown as Mock;
const mockSeedDemoData = seedDemoData as unknown as Mock;
const mockFetchBagStats = bagStatsApi.fetchBagStats as unknown as Mock;
const mockLoadPracticeHistory =
  loadPracticeMissionHistory as unknown as Mock;
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
    mockFetchBagStats.mockResolvedValue(mockBagStats);
    mockLoadPracticeHistory.mockResolvedValue([]);
  });

  afterEach(() => {
    dateNowSpy?.mockRestore();
    vi.clearAllMocks();
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
});
