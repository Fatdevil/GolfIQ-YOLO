import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/range/api", () => ({
  postRangeAnalyze: vi.fn(),
}));
vi.mock("@/user/historyApi", () => ({
  postRangeSessionSnapshots: vi.fn(),
}));
vi.mock("@/access/PlanProvider", () => ({
  PlanProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePlan: () => ({ plan: "PRO", setPlan: vi.fn(), hasFeature: () => true }),
}));

import { postRangeAnalyze } from "@/features/range/api";
import RangePracticePage from "../src/pages/RangePracticePage";
import { UnitsContext } from "@/preferences/UnitsContext";
import { UserSessionProvider } from "@/user/UserSessionContext";

const mockedPostRangeAnalyze = vi.mocked(postRangeAnalyze);

describe("RangePracticePage camera fitness", () => {
  beforeEach(() => {
    mockedPostRangeAnalyze.mockReset();
  });

  it("renders camera fitness badge with reasons", async () => {
    mockedPostRangeAnalyze.mockResolvedValue({
      ball_speed_mps: 55,
      quality: { score: 0.42, level: "warning", reasons: ["fps_low", "light_low"] },
    });

    renderWithUnits(<RangePracticePage />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Hit & analyze/i }));

    await waitFor(() => expect(mockedPostRangeAnalyze).toHaveBeenCalledTimes(1));

    expect(
      await screen.findByText(/Camera needs attention/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/Increase frame rate or shutter speed/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/Scene is too dark – add light or move to a brighter spot./i),
    ).toBeTruthy();
  });
});

function renderWithUnits(ui: React.ReactElement) {
  return render(
    <UserSessionProvider>
      <UnitsContext.Provider value={{ unit: "metric", setUnit: () => {} }}>
        {ui}
      </UnitsContext.Provider>
    </UserSessionProvider>
  );
}
