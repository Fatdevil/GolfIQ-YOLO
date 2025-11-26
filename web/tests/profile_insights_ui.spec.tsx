import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";

import MyGolfIQPage from "@/pages/profile/MyGolfIQPage";

import { UserSessionProvider } from "@/user/UserSessionContext";

const mockUseCoachInsights = vi.hoisted(() => vi.fn(() => ({ status: "empty" } as const)));

vi.mock("@/features/quickround/storage", () => ({
  loadAllRoundsFull: () => [],
}));

vi.mock("@/features/range/ghost", () => ({
  listGhosts: () => [],
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

describe("MyGolfIQPage empty states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCoachInsights.mockReturnValue({ status: "empty" });
  });

  it("shows empty messages when no local data is stored", () => {
    render(
      <MemoryRouter>
        <MyGolfIQPage />
      </MemoryRouter>,
      { wrapper: UserSessionProvider }
    );

    expect(screen.getByText(/You have not recorded any quick rounds yet/i)).toBeTruthy();
    expect(screen.getByText(/No range ghosts saved yet/i)).toBeTruthy();
    expect(screen.getByText(/0 of 0 clubs/i)).toBeTruthy();
  });
});
