import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { UnitsContext } from "@/preferences/UnitsContext";

import MyGolfIQPage from "@/pages/profile/MyGolfIQPage";
import type { RangeSession } from "@/features/range/sessions";
import type { QuickRound } from "@/features/quickround/types";
import type { GhostProfile } from "@/features/range/ghost";
import type { BagState } from "@/bag/types";

import { createAccessWrapper } from "./test-helpers/access";

const mockLoadRangeSessions = vi.hoisted(() => vi.fn());
const mockGetCoachTag = vi.hoisted(() => vi.fn());
const mockLoadRounds = vi.hoisted(() => vi.fn(() => [] as QuickRound[]));
const mockListGhosts = vi.hoisted(() => vi.fn(() => [] as GhostProfile[]));
const mockLoadBag = vi.hoisted(() =>
  vi.fn(() => ({
    updatedAt: Date.now(),
    clubs: [],
  }) as BagState)
);

vi.mock("@/features/range/sessions", () => ({
  loadRangeSessions: mockLoadRangeSessions,
  getCoachTag: mockGetCoachTag,
}));

vi.mock("@/features/quickround/storage", () => ({
  loadAllRoundsFull: mockLoadRounds,
}));

vi.mock("@/features/range/ghost", () => ({
  listGhosts: mockListGhosts,
}));

vi.mock("@/bag/storage", () => ({
  loadBag: mockLoadBag,
}));

describe("MyGolfIQPage range sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders recent range sessions with coach tags", () => {
    const sessions: RangeSession[] = [
      {
        id: "session-1",
        startedAt: "2024-03-10T09:00:00.000Z",
        endedAt: "2024-03-10T09:30:00.000Z",
        shotCount: 15,
        avgCarry_m: 120,
        carryStd_m: 5,
        missionId: "wedge-ladder",
      },
      {
        id: "session-2",
        startedAt: "2024-03-05T09:00:00.000Z",
        endedAt: "2024-03-05T09:20:00.000Z",
        shotCount: 20,
        avgCarry_m: 150,
        carryStd_m: 12,
      },
    ];

    mockLoadRangeSessions.mockReturnValue(sessions);
    mockGetCoachTag.mockImplementation((session: RangeSession) =>
      session.id === "session-1" ? "mission_completed" : "high_hit_rate"
    );

    const localeSpy = vi
      .spyOn(Date.prototype, "toLocaleString")
      .mockReturnValueOnce("March 10, 2024, 10:30 AM")
      .mockReturnValueOnce("March 5, 2024, 10:20 AM");

    const AccessWrapper = createAccessWrapper();
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <AccessWrapper>
        <UnitsContext.Provider value={{ unit: "metric", setUnit: () => {} }}>
          {children}
        </UnitsContext.Provider>
      </AccessWrapper>
    );

    render(
      <MemoryRouter>
        <MyGolfIQPage />
      </MemoryRouter>,
      { wrapper: Wrapper }
    );

    localeSpy.mockRestore();

    expect(
      screen.getByRole("heading", { level: 2, name: /Range sessions/i })
    ).toBeTruthy();

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);

    expect(screen.getByText("Mission: wedge-ladder")).toBeTruthy();
    expect(screen.getByText("15 shots · avg 120 m · std 5 m")).toBeTruthy();
    expect(screen.getByText("Mission completed – great work")).toBeTruthy();
    expect(screen.getByText("High hit rate")).toBeTruthy();

    const firstItem = items[0];
    expect(
      within(firstItem).getByText("Mission completed – great work")
    ).toBeTruthy();
  });

  it("renders empty state when no sessions are stored", () => {
    mockLoadRangeSessions.mockReturnValue([]);

    const AccessWrapper = createAccessWrapper();
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <AccessWrapper>
        <UnitsContext.Provider value={{ unit: "metric", setUnit: () => {} }}>
          {children}
        </UnitsContext.Provider>
      </AccessWrapper>
    );

    render(
      <MemoryRouter>
        <MyGolfIQPage />
      </MemoryRouter>,
      { wrapper: Wrapper }
    );

    expect(screen.getByText(/No range sessions saved yet\./i)).toBeTruthy();
  });
});
