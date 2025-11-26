import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RangePracticePage from "@/pages/RangePracticePage";
import { UnitsContext } from "@/preferences/UnitsContext";
import type { DistanceUnit } from "@/preferences/units";
import { UserSessionProvider } from "@/user/UserSessionContext";
import { postRangeAnalyze } from "@/features/range/api";
import type { RangeSession } from "@/features/range/sessions";

const mockSessions = vi.hoisted<RangeSession[]>(() => [
  {
    id: "rs-a",
    startedAt: "2025-05-10T08:00:00.000Z",
    endedAt: "2025-05-10T09:00:00.000Z",
    shotCount: 2,
  },
]);

const loadRangeSessions = vi.hoisted(() =>
  vi.fn<() => RangeSession[]>(() => mockSessions),
);

vi.mock("@/features/range/api", () => ({
  postRangeAnalyze: vi.fn(),
}));

vi.mock("@/features/range/sessions", async () => {
  const actual = await vi.importActual<typeof import("@/features/range/sessions")>(
    "@/features/range/sessions",
  );
  return {
    ...actual,
    loadRangeSessions,
  };
});

vi.mock("@/user/historyApi", () => ({
  postRangeSessionSnapshots: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/access/PlanProvider", () => ({
  PlanProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePlan: () => ({ plan: "PRO", setPlan: vi.fn(), hasFeature: () => true }),
}));

vi.mock("@/user/UserSessionContext", () => ({
  UserSessionProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useUserSession: () => ({ session: { userId: "test-user", createdAt: "" }, loading: false }),
}));

const mockedPostRangeAnalyze = vi.mocked(postRangeAnalyze);

function renderWithUnit(unit: DistanceUnit, ui: React.ReactElement) {
  return render(
    <UserSessionProvider>
      <UnitsContext.Provider value={{ unit, setUnit: () => {} }}>
        {ui}
      </UnitsContext.Provider>
    </UserSessionProvider>,
  );
}

describe("Range practice ghost match mode", () => {
  beforeEach(() => {
    mockedPostRangeAnalyze.mockReset();
    mockedPostRangeAnalyze.mockResolvedValue({ ball_speed_mps: 60, carry_m: 150 });
    loadRangeSessions.mockReturnValue(mockSessions);
  });

  it("updates ghost stats as shots are registered", async () => {
    renderWithUnit("metric", <RangePracticePage />);

    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/Target Bingo/i), "GHOSTMATCH_V1");

    const ghostSelect = await screen.findByLabelText(/GhostMatch/i);
    await user.selectOptions(ghostSelect, "rs-a");

    const hitButton = screen.getByRole("button", { name: /Hit & analyze/i });

    await user.click(hitButton);
    await waitFor(() => expect(mockedPostRangeAnalyze).toHaveBeenCalledTimes(1));

    await screen.findByText(/Your shots: 1/i);
    expect(screen.getByText(/Ghost shots: 2/i)).toBeTruthy();
    expect(screen.getByText("−1")).toBeTruthy();

    await user.click(hitButton);
    await waitFor(() => expect(mockedPostRangeAnalyze).toHaveBeenCalledTimes(2));

    await screen.findByText(/Your shots: 2/i);
    expect(screen.getByText("0")).toBeTruthy();
  });
});
