import React, { type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnitsContext } from "../src/preferences/UnitsContext";

import RangePracticePage from "../src/pages/RangePracticePage";
import type { BagState } from "../src/bag/types";
import { UserAccessContext } from "../src/access/UserAccessContext";
import type { FeatureId, PlanName } from "../src/access/types";
import { UserSessionProvider } from "../src/user/UserSessionContext";

const { loadBagMock, updateClubCarryMock } = vi.hoisted(() => ({
  loadBagMock: vi.fn(),
  updateClubCarryMock: vi.fn(),
}));

vi.mock("../src/bag/storage", () => ({
  loadBag: loadBagMock,
  updateClubCarry: updateClubCarryMock,
}));

const { postRangeAnalyzeMock } = vi.hoisted(() => ({
  postRangeAnalyzeMock: vi.fn(),
}));

const { recordPracticeMissionOutcomeMock } = vi.hoisted(() => ({
  recordPracticeMissionOutcomeMock: vi.fn(),
}));

vi.mock("../src/features/range/api", () => ({
  postRangeAnalyze: postRangeAnalyzeMock,
}));
vi.mock("../src/user/historyApi", () => ({
  postRangeSessionSnapshots: vi.fn(),
}));
vi.mock("@/practice/practiceMissionHistory", async () => {
  const actual = await vi.importActual<typeof import("@/practice/practiceMissionHistory")>(
    "@/practice/practiceMissionHistory"
  );

  return {
    ...actual,
    recordPracticeMissionOutcome: recordPracticeMissionOutcomeMock,
  };
});
vi.mock("../src/access/PlanProvider", () => ({
  PlanProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePlan: () => ({ plan: "PRO", setPlan: vi.fn(), hasFeature: () => true }),
}));

const accessValue = {
  loading: false,
  plan: "pro" as PlanName,
  hasFeature: (_feature: FeatureId) => true,
  hasPlanFeature: () => true,
  isPro: true,
  isFree: false,
  refresh: async () => undefined,
  trial: null,
  expiresAt: null,
  error: undefined,
};

function renderWithProviders(ui: ReactElement, access = accessValue) {
  return render(
    <MemoryRouter>
      <UserSessionProvider>
        <UserAccessContext.Provider value={access}>
          <UnitsContext.Provider value={{ unit: "metric", setUnit: () => {} }}>
            {ui}
          </UnitsContext.Provider>
        </UserAccessContext.Provider>
      </UserSessionProvider>
    </MemoryRouter>,
  );
}

describe("RangePracticePage missions mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage?.clear();
    recordPracticeMissionOutcomeMock.mockReset();
    recordPracticeMissionOutcomeMock.mockResolvedValue([]);
    loadBagMock.mockImplementation(() => ({
      updatedAt: Date.now(),
      clubs: [
        { id: "PW", label: "Pitching wedge", carry_m: null },
        { id: "7i", label: "7-iron", carry_m: null },
      ],
    }));
    updateClubCarryMock.mockImplementation((bag: BagState, clubId: string, carry: number | null) => ({
      ...bag,
      updatedAt: Date.now(),
      clubs: bag.clubs.map((club) =>
        club.id === clubId ? { ...club, carry_m: carry } : club
      ),
    }));
    postRangeAnalyzeMock.mockResolvedValue({ carry_m: 210 });
  });

  it("renders mission selector and mission progress for Pro", async () => {
    const user = userEvent.setup();

    renderWithProviders(<RangePracticePage />);

    await user.click(screen.getAllByTestId("mission-mode-button")[0]);

    const missionSelect = await screen.findByLabelText(/Mission/i, { selector: "select" });
    expect(missionSelect).toBeInstanceOf(HTMLSelectElement);

    await user.selectOptions(missionSelect, "Driver fairway challenge");

    await waitFor(() =>
      expect(window.localStorage.getItem("golfiq.range.mission.v2")).toBe(
        "driver_fairway_challenge",
      ),
    );

    const hitButton = screen
      .getAllByRole("button", { name: /Hit & analyze/i })
      .find((button: HTMLButtonElement) => !button.hasAttribute("disabled")) ??
      screen.getAllByRole("button", { name: /Hit & analyze/i })[0];
    await user.click(hitButton);
    await user.click(hitButton);
    await user.click(hitButton);

    await waitFor(() => expect(postRangeAnalyzeMock).toHaveBeenCalledTimes(3));

    await screen.findByText(/Hits in mission targets/i);
    expect(screen.getByText(/3\s*\/\s*3/)).toBeInTheDocument();
    expect(screen.getAllByText(/Driver fairway challenge/).length).toBeGreaterThan(0);
  });

  it("gates missions for free users", async () => {
    const user = userEvent.setup();
    const freeAccess = {
      ...accessValue,
      plan: "free" as PlanName,
      isPro: false,
      isFree: true,
    };

    renderWithProviders(<RangePracticePage />, freeAccess);

    const buttons = screen.getAllByTestId("mission-mode-button");
    await user.click(buttons[buttons.length - 1]);

    await screen.findByTestId("mission-upgrade-message");
  });
});
