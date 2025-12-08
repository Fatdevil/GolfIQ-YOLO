import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
import RangePracticePage from "./RangePracticePage";
import { RangeImpactCard } from "../range/RangeImpactCard";
import type { RangeShotMetrics } from "../range/types";
import { UnitsContext } from "@/preferences/UnitsContext";
import type { DistanceUnit } from "@/preferences/units";
import { UserSessionProvider } from "@/user/UserSessionContext";
import { postRangeSessionSnapshots } from "@/user/historyApi";

const mockedPostRangeAnalyze = vi.mocked(postRangeAnalyze);

describe("RangePracticePage", () => {
  beforeEach(() => {
    mockedPostRangeAnalyze.mockReset();
    vi.mocked(postRangeSessionSnapshots).mockReset();
  });

  it("logs a shot and updates UI", async () => {
    mockedPostRangeAnalyze.mockResolvedValue({
      ball_speed_mps: 60,
      ball_speed_mph: 134,
      carry_m: 180,
      launch_deg: 12,
      side_deg: -3,
      quality: { score: 0.9, level: "good", reasons: [] },
    });

    renderWithUnit("metric", <RangePracticePage />);

    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/Club/i), "PW");
    const [hitButton] = screen.getAllByRole("button", { name: /Hit & analyze/i });
    await user.click(hitButton);

    await waitFor(() => expect(mockedPostRangeAnalyze).toHaveBeenCalledTimes(1));

    await screen.findByText("134.0 mph");
    await screen.findAllByText("180 m");
    expect(screen.getByText("Shots: 1")).toBeDefined();
    expect(screen.getByText(/Pitching wedge • 134.0 mph/)).toBeDefined();
  });

  it("posts snapshot when ending a session", async () => {
    mockedPostRangeAnalyze.mockResolvedValue({
      ball_speed_mps: 60,
      ball_speed_mph: 134,
      carry_m: 180,
      launch_deg: 12,
      side_deg: -3,
      quality: { score: 0.9, level: "good", reasons: [] },
    });

    renderWithUnit("metric", <RangePracticePage />);

    const user = userEvent.setup();
    const hitButtons = screen.getAllByRole("button", { name: /Hit & analyze/i });
    await user.click(hitButtons[0]);

    await waitFor(() => expect(mockedPostRangeAnalyze).toHaveBeenCalledTimes(1));

    const endButtons = screen.getAllByRole("button", { name: /End session/i });
    await user.click(endButtons[0]);

    await waitFor(() =>
      expect(postRangeSessionSnapshots).toHaveBeenCalledTimes(1)
    );
  });

  it("renders impact card carry in yards when unit is imperial", () => {
    const metrics: RangeShotMetrics = {
      ballSpeedMph: 134,
      ballSpeedMps: 60,
      carryM: 150,
      launchDeg: 12,
      sideAngleDeg: 0,
      quality: "good",
    };

    renderWithUnit(
      "imperial",
      <RangeImpactCard metrics={metrics} />,
    );

    expect(screen.getByText("164 yd")).toBeDefined();
  });
});

function renderWithUnit(
  unit: DistanceUnit,
  ui: React.ReactElement,
  initialPath = "/range/practice"
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <UserSessionProvider>
        <UnitsContext.Provider value={{ unit, setUnit: () => {} }}>
          {ui}
        </UnitsContext.Provider>
      </UserSessionProvider>
    </MemoryRouter>
  );
}
