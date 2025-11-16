import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";

import MyGolfIQPage from "@/pages/profile/MyGolfIQPage";
import type { QuickRound } from "@/features/quickround/types";

import { createAccessWrapper } from "./test-helpers/access";
import { UnitsContext } from "@/preferences/UnitsContext";

const mockRounds: QuickRound[] = [
  {
    id: "round-1",
    courseName: "Mock Course",
    holes: [
      { index: 1, par: 4, strokes: 4 },
      { index: 2, par: 5, strokes: 6 },
    ],
    startedAt: "2024-07-01T10:00:00.000Z",
    completedAt: "2024-07-01T14:00:00.000Z",
    handicap: 2,
  },
];

const loadAllRoundsFull = vi.hoisted(() => () => mockRounds);
const listGhosts = vi.hoisted(() => () => []);
const loadBag = vi.hoisted(() => () => ({ updatedAt: Date.now(), clubs: [] }));
const loadRangeSessions = vi.hoisted(() => () => []);
const getCoachTag = vi.hoisted(() => () => "mixed_results");
const mockComputeInsights = vi.hoisted(() =>
  vi.fn(() => ({
    strengths: [{ id: "rounds.good_net_scoring", kind: "strength" }],
    focuses: [{ id: "range.mission_completion_low", kind: "focus" }],
    suggestedMission: "wedge-ladder",
  }))
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
  getCoachTag,
}));

vi.mock("@/profile/insights", () => ({
  computeInsights: mockComputeInsights,
}));

describe("MyGolfIQPage insights card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders insights card with strength, focus and suggested mission", () => {
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

    expect(screen.getByText(/My GolfIQ insights/i)).toBeTruthy();
    expect(
      screen.getByText(/You often score well net compared to your handicap/i)
    ).toBeTruthy();
    expect(
      screen.getByText(/You rarely complete your range missions/i)
    ).toBeTruthy();
    expect(
      screen.getByText(/Suggested range mission: wedge-ladder/i)
    ).toBeTruthy();
  });
});
