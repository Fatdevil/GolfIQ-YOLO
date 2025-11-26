import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/range/api", () => ({
  postRangeAnalyze: vi.fn(),
}));
vi.mock("@/user/historyApi", () => ({
  postRangeSessionSnapshots: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/user/UserSessionContext", () => ({
  UserSessionProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useUserSession: () => ({ session: { userId: "test-user", createdAt: "" }, loading: false }),
}));

import { postRangeAnalyze } from "@/features/range/api";
import RangePracticePage from "@/pages/RangePracticePage";
import { UnitsContext } from "@/preferences/UnitsContext";
import type { DistanceUnit } from "@/preferences/units";
import { UserSessionProvider } from "@/user/UserSessionContext";

const mockedPostRangeAnalyze = vi.mocked(postRangeAnalyze);

describe("Range practice Target Bingo v1", () => {
  beforeEach(() => {
    mockedPostRangeAnalyze.mockReset();
  });

  it("tracks bingo hits and completed lines", async () => {
    mockedPostRangeAnalyze
      .mockResolvedValueOnce({ ball_speed_mps: 60, carry_m: 55 })
      .mockResolvedValueOnce({ ball_speed_mps: 60, carry_m: 65 })
      .mockResolvedValueOnce({ ball_speed_mps: 60, carry_m: 75 });

    renderWithUnit("metric", <RangePracticePage />);

    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/Target Bingo/i), "TARGET_BINGO_V1");

    const hitButton = screen.getByRole("button", { name: /Hit & analyze/i });
    await user.click(hitButton);
    await waitFor(() => expect(mockedPostRangeAnalyze).toHaveBeenCalledTimes(1));

    await user.click(hitButton);
    await waitFor(() => expect(mockedPostRangeAnalyze).toHaveBeenCalledTimes(2));

    await user.click(hitButton);
    await waitFor(() => expect(mockedPostRangeAnalyze).toHaveBeenCalledTimes(3));

    await screen.findByTestId("bingo-lines");
    expect(screen.getByTestId("bingo-lines").textContent).toMatch(/1/);
    expect(screen.getByTestId("bingo-shots").textContent).toMatch(/3/);
    expect(screen.getByTestId("bingo-targets").textContent).toMatch(/3/);
  });
});

function renderWithUnit(unit: DistanceUnit, ui: React.ReactElement) {
  return render(
    <UserSessionProvider>
      <UnitsContext.Provider value={{ unit, setUnit: () => {} }}>
        {ui}
      </UnitsContext.Provider>
    </UserSessionProvider>
  );
}
