import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import MyGolfIQPage from "@/pages/profile/MyGolfIQPage";
import type { QuickRound } from "@/features/quickround/types";
import type { GhostProfile } from "@/features/range/ghost";
import type { BagState } from "@/bag/types";
import { UserSessionProvider } from "@/user/UserSessionContext";
import type { RangeSession } from "@/features/range/sessions";
import { PlanProvider } from "@/access/PlanProvider";
import type { CoachInsightsState } from "@/profile/useCoachInsights";

const mockRounds: QuickRound[] = [
  {
    id: "r1",
    courseName: "Championship Course",
    holes: [
      { index: 1, par: 4, strokes: 5 },
      { index: 2, par: 3, strokes: 3 },
    ],
    startedAt: "2024-08-01T10:00:00.000Z",
    completedAt: "2024-08-01T13:00:00.000Z",
    handicap: 2,
  },
  {
    id: "r2",
    courseName: "Links Course",
    holes: [
      { index: 1, par: 4, strokes: 4 },
      { index: 2, par: 5, strokes: 6 },
    ],
    startedAt: "2024-07-28T09:00:00.000Z",
    completedAt: "2024-07-28T12:00:00.000Z",
  },
  {
    id: "r3",
    courseName: "Practice Round",
    holes: [
      { index: 1, par: 4 },
      { index: 2, par: 3 },
    ],
    startedAt: "2024-07-15T09:00:00.000Z",
  },
  {
    id: "r4",
    holes: [
      { index: 1, par: 4, strokes: 5 },
      { index: 2, par: 4, strokes: 4 },
    ],
    startedAt: "2024-07-10T09:00:00.000Z",
    completedAt: "2024-07-10T11:00:00.000Z",
  },
];

const mockGhosts: GhostProfile[] = [
  {
    id: "g1",
    name: "Demo Ghost",
    createdAt: Date.UTC(2024, 6, 30),
    config: { target_m: 150, tolerance_m: 5, maxShots: 20 },
    result: { totalShots: 20, hits: 12, hitRate_pct: 60, avgAbsError_m: 3.2 },
  },
];

const mockBag: BagState = {
  updatedAt: Date.now(),
  clubs: [
    { id: "DR", label: "Driver", carry_m: 250 },
    { id: "3W", label: "3 Wood", carry_m: null },
    { id: "7i", label: "7 Iron", carry_m: 140 },
    { id: "PW", label: "Pitching Wedge", carry_m: null },
  ],
};

const loadAllRoundsFull = vi.hoisted(() => () => mockRounds);
const listGhosts = vi.hoisted(() => () => mockGhosts);
const loadBag = vi.hoisted(() => () => mockBag);
const loadRangeSessions = vi.hoisted(() => vi.fn((): RangeSession[] => []));
const migrateLocalHistoryOnce = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const mockUseCaddieMemberId = vi.hoisted(() => vi.fn());
const mockFetchCaddieInsights = vi.hoisted(() => vi.fn());
const mockUseCoachInsights = vi.hoisted(() =>
  vi.fn<() => CoachInsightsState>(() => ({ status: "empty" })),
);

vi.mock("@/features/quickround/storage", () => ({
  loadAllRoundsFull,
}));

vi.mock("@/features/range/ghost", () => ({
  listGhosts,
}));

vi.mock("@/bag/storage", () => ({
  loadBag,
}));

vi.mock("@/features/range/sessions", () => ({
  loadRangeSessions,
}));

vi.mock("@/user/historyMigration", () => ({
  migrateLocalHistoryOnce,
}));

vi.mock("@/profile/memberIdentity", () => ({
  useCaddieMemberId: () => mockUseCaddieMemberId(),
}));

vi.mock("@/api/caddieInsights", () => ({
  fetchCaddieInsights: (...args: Parameters<typeof mockFetchCaddieInsights>) =>
    mockFetchCaddieInsights(...args),
}));

vi.mock("@/profile/useCoachInsights", () => ({
  useCoachInsights: () => mockUseCoachInsights(),
}));

describe("MyGolfIQPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCaddieMemberId.mockReturnValue(undefined);
    mockUseCoachInsights.mockReturnValue({ status: "empty" });
    loadRangeSessions.mockReturnValue([]);
  });

  afterEach(() => {
    window.localStorage.clear();
    cleanup();
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <PlanProvider>
          <MyGolfIQPage />
        </PlanProvider>
      </MemoryRouter>,
      { wrapper: UserSessionProvider },
    );

  it("renders quick round, range and bag summaries", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: /My GolfIQ/i, level: 1 })
    ).toBeTruthy();
    expect(screen.getByText(/Total rounds/i)).toBeTruthy();
    expect(screen.getByText(/Completed rounds/i)).toBeTruthy();
    expect(screen.getByText(/Championship Course/i)).toBeTruthy();
    expect(screen.getByText(/Unknown course/i)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /Range practice/i })).toBeTruthy();
    expect(screen.getByText(/Ghost profiles/i)).toBeTruthy();
    expect(screen.getByText(/Bag snapshot/i)).toBeTruthy();
    expect(screen.getByText(/Complete your bag/i)).toBeTruthy();
  });

  it("shows caddie insights when telemetry exists", async () => {
    const sampleInsights = {
      memberId: "member-123",
      from_ts: "2024-01-01T00:00:00Z",
      to_ts: "2024-02-01T00:00:00Z",
      advice_shown: 10,
      advice_accepted: 7,
      accept_rate: 0.7,
      per_club: [
        { club: "7i", shown: 5, accepted: 4 },
        { club: "PW", shown: 3, accepted: 2 },
      ],
    };
    mockUseCaddieMemberId.mockReturnValue("member-123");
    mockFetchCaddieInsights.mockResolvedValue(sampleInsights);

    renderPage();

    await waitFor(() =>
      expect(mockFetchCaddieInsights).toHaveBeenCalledWith("member-123", 30),
    );

    expect(await screen.findByText(/Advice shown/i)).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("7i")).toBeTruthy();
    expect(screen.getByText("70%" )).toBeTruthy();
  });

  it("shows empty caddie state when no advice has been recorded", async () => {
    const emptyInsights = {
      memberId: "member-123",
      from_ts: "2024-01-01T00:00:00Z",
      to_ts: "2024-02-01T00:00:00Z",
      advice_shown: 0,
      advice_accepted: 0,
      accept_rate: null,
      per_club: [],
    };
    mockUseCaddieMemberId.mockReturnValue("member-123");
    mockFetchCaddieInsights.mockResolvedValue(emptyInsights);

    renderPage();

    await waitFor(() => expect(mockFetchCaddieInsights).toHaveBeenCalled());

    expect(
      await screen.findByText(/We haven't recorded any caddie advice for you yet/i),
    ).toBeTruthy();
  });

  it("summarizes ghost match range sessions", () => {
    loadRangeSessions.mockReturnValue([
      {
        id: "rs-1",
        startedAt: "2025-05-01T10:00:00.000Z",
        endedAt: "2025-05-01T11:00:00.000Z",
        shotCount: 12,
        gameType: "GHOSTMATCH_V1",
        ghostScoreDelta: -2,
      },
      {
        id: "rs-2",
        startedAt: "2025-05-02T10:00:00.000Z",
        endedAt: "2025-05-02T11:00:00.000Z",
        shotCount: 15,
        gameType: "GHOSTMATCH_V1",
        ghostScoreDelta: 1,
      },
    ]);

    renderPage();

    expect(
      screen.getByText(/Ghost matches: 2, best delta: -2 shots vs ghost/i),
    ).toBeTruthy();
  });

  it("shows upgrade overlay for free users on caddie insights", () => {
    renderPage();

    expect(screen.getAllByText(/Unlock full GolfIQ/).length).toBeGreaterThan(0);
  });

  it("hides upgrade overlay for pro users", async () => {
    window.localStorage.setItem("golfiq_plan_v1", "PRO");

    renderPage();

    await waitFor(() =>
      expect(screen.queryByText(/Unlock full GolfIQ/)).toBeNull(),
    );
  });

  it("renders coach insights when available", () => {
    mockUseCoachInsights.mockReturnValue({
      status: "ready",
      suggestions: [
        {
          type: "sg",
          severity: "high",
          categoryKey: "tee",
          messageKey: "coach.sg.biggestLeak.high",
        },
      ],
    });

    renderPage();

    expect(screen.getByText(/Coach insights/i)).toBeTruthy();
    expect(screen.getByText(/losing a lot of strokes/i)).toBeTruthy();
  });
});
