import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import MyGolfIQPage from "@/pages/profile/MyGolfIQPage";
import type { BagState } from "@/bag/types";
import type { RangeSession } from "@/features/range/sessions";

import { createAccessWrapper } from "./test-helpers/access";

const initialBag: BagState = {
  updatedAt: 0,
  clubs: [{ id: "7i", label: "7-iron", carry_m: 140 }],
};

const mockSessions: RangeSession[] = [
  {
    id: "rs-1",
    startedAt: "2024-01-01T10:00:00.000Z",
    endedAt: "2024-01-01T11:00:00.000Z",
    clubId: "7i",
    shotCount: 12,
    avgCarry_m: 155,
    carryStd_m: 5,
    missionId: null,
    missionGoodReps: null,
    missionTargetReps: null,
    target_m: null,
    hitRate_pct: null,
    avgError_m: null,
    ghostSaved: false,
  },
];

const updateClubCarry = vi.hoisted(() =>
  vi.fn((bag: BagState, clubId: string, carry: number) => ({
    ...bag,
    updatedAt: bag.updatedAt + 1,
    clubs: bag.clubs.map((club) =>
      club.id === clubId ? { ...club, carry_m: carry } : club
    ),
  }))
);

vi.mock("@/bag/storage", () => ({
  loadBag: () => initialBag,
  updateClubCarry,
}));

vi.mock("@/features/quickround/storage", () => ({
  loadAllRoundsFull: () => [],
}));

vi.mock("@/features/range/ghost", () => ({
  listGhosts: () => [],
}));

vi.mock("@/features/range/sessions", async () => {
  const actual = await vi.importActual<typeof import("@/features/range/sessions")>(
    "@/features/range/sessions"
  );
  return {
    ...actual,
    loadRangeSessions: () => mockSessions,
  };
});

describe("MyGolfIQPage smart bag sync", () => {
  it("shows smart bag suggestions and applies updates", () => {
    render(
      <MemoryRouter>
        <MyGolfIQPage />
      </MemoryRouter>,
      { wrapper: createAccessWrapper() }
    );

    expect(screen.getByText(/Smart Bag suggestions/i)).toBeTruthy();
    expect(
      screen.getByText("Current: 140 m · Suggested: 155 m (1 sessions)")
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Update carry/i }));

    expect(updateClubCarry).toHaveBeenCalledWith(initialBag, "7i", 155);
  });
});
