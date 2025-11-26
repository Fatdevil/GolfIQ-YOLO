import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import MyGolfIQPage from "@/pages/profile/MyGolfIQPage";

import { UserSessionProvider } from "@/user/UserSessionContext";

const mockUseCoachInsights = vi.hoisted(() => vi.fn(() => ({ status: "empty" } as const)));

vi.mock("@/bag/storage", () => ({
  loadBag: () => ({
    updatedAt: 0,
    clubs: [
      { id: "DR", label: "Driver", carry_m: 240 },
      { id: "7i", label: "7-iron", carry_m: null },
    ],
  }),
}));

vi.mock("@/features/quickround/storage", () => ({
  loadAllRoundsFull: () => [],
}));

vi.mock("@/features/range/ghost", () => ({
  listGhosts: () => [],
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

describe("MyGolfIQPage bag snapshot", () => {
  it("shows a CTA when some clubs are missing carry distances", () => {
    render(
      <MemoryRouter>
        <MyGolfIQPage />
      </MemoryRouter>,
      { wrapper: UserSessionProvider }
    );

    expect(screen.getByText(/1 of 2 clubs/i)).toBeTruthy();
    expect(screen.getByText(/Complete your bag/i)).toBeTruthy();
  });
});
