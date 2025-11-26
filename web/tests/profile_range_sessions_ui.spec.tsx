import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import MyGolfIQPage from "@/pages/profile/MyGolfIQPage";
import type { GhostProfile } from "@/features/range/ghost";
import { UserSessionProvider } from "@/user/UserSessionContext";

const mockUseCoachInsights = vi.hoisted(() => vi.fn(() => ({ status: "empty" } as const)));

const ghosts: GhostProfile[] = [
  {
    id: "g1",
    name: "Target Bingo",
    createdAt: Date.UTC(2024, 2, 10),
    config: { target_m: 140, tolerance_m: 5, maxShots: 20 },
    result: { totalShots: 18, hits: 12, hitRate_pct: 66, avgAbsError_m: 2.3 },
  },
];

vi.mock("@/features/quickround/storage", () => ({
  loadAllRoundsFull: () => [],
}));

vi.mock("@/features/range/ghost", () => ({
  listGhosts: () => ghosts,
}));

vi.mock("@/bag/storage", () => ({
  loadBag: () => ({ updatedAt: Date.now(), clubs: [] }),
}));

vi.mock("@/features/range/sessions", () => ({
  loadRangeSessions: () => [],
}));

vi.mock("@/user/historyMigration", () => ({
  migrateLocalHistoryOnce: () => Promise.resolve(),
}));

vi.mock("@/profile/useCoachInsights", () => ({
  useCoachInsights: () => mockUseCoachInsights(),
}));

vi.mock("@/access/PlanProvider", () => ({
  PlanProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePlan: () => ({ plan: "PRO", setPlan: vi.fn(), hasFeature: () => true }),
}));

describe("MyGolfIQPage range overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCoachInsights.mockReturnValue({ status: "empty" });
  });

  it("shows the latest ghost stats", () => {
    render(
      <MemoryRouter>
        <MyGolfIQPage />
      </MemoryRouter>,
      { wrapper: UserSessionProvider }
    );

    expect(screen.getByText(/Ghost profiles/i)).toBeTruthy();
    expect(screen.getByText(/Target Bingo/i)).toBeTruthy();
    expect(screen.getByText(/total shots/i)).toBeTruthy();
    expect(screen.getByText(/66%/)).toBeTruthy();
  });
});
