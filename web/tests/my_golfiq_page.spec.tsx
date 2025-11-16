import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import MyGolfIQPage from "@/pages/profile/MyGolfIQPage";
import type { QuickRound } from "@/features/quickround/types";
import type { GhostProfile } from "@/features/range/ghost";
import type { BagState } from "@/bag/types";

import { createAccessWrapper } from "./test-helpers/access";
import { UnitsContext } from "@/preferences/UnitsContext";

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

vi.mock("@/features/quickround/storage", () => ({
  loadAllRoundsFull,
}));

vi.mock("@/features/range/ghost", () => ({
  listGhosts,
}));

vi.mock("@/bag/storage", () => ({
  loadBag,
}));

describe("MyGolfIQPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders quick round, range and bag summaries", () => {
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
      { wrapper: Wrapper },
    );

    expect(
      screen.getByRole("heading", { name: /My GolfIQ/i, level: 1 })
    ).toBeTruthy();
    expect(screen.getByText(/Total rounds/i)).toBeTruthy();
    expect(screen.getByText(/Average net strokes/i)).toBeTruthy();
    expect(screen.getByText(/Championship Course/i)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /Range practice/i })).toBeTruthy();
    expect(screen.getByText(/Demo Ghost/i)).toBeTruthy();
    expect(screen.getByText(/Bag snapshot/i)).toBeTruthy();
    expect(screen.getByText(/Complete your bag/i)).toBeTruthy();
  });
});
