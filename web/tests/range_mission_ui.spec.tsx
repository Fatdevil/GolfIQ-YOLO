import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { UnitsContext } from "../src/preferences/UnitsContext";

import RangePracticePage from "../src/pages/RangePracticePage";
import type { BagState } from "../src/bag/types";
import { UserAccessContext } from "../src/access/UserAccessContext";
import type { FeatureId, PlanName } from "../src/access/types";

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

vi.mock("../src/features/range/api", () => ({
  postRangeAnalyze: postRangeAnalyzeMock,
}));

const accessValue = {
  loading: false,
  plan: "pro" as PlanName,
  hasFeature: (_feature: FeatureId) => true,
};

function renderWithProviders(ui: ReactElement) {
  return render(
    <MemoryRouter>
      <UserAccessContext.Provider value={accessValue}>
        <UnitsContext.Provider value={{ unit: "metric", setUnit: () => {} }}>
          {ui}
        </UnitsContext.Provider>
      </UserAccessContext.Provider>
    </MemoryRouter>
  );
}

describe("RangePracticePage missions mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage?.clear();
    loadBagMock.mockImplementation(() => ({
      updatedAt: Date.now(),
      clubs: [
        { id: "7i", label: "7-iron", carry_m: null },
        { id: "PW", label: "Pitching wedge", carry_m: null },
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

  it("renders mission selector and groove meter", async () => {
    const user = userEvent.setup();

    renderWithProviders(<RangePracticePage />);

    await user.click(screen.getByRole("button", { name: /Missions/i }));

    const missionSelect = await screen.findByLabelText(/Mission/i);
    expect(missionSelect).toBeInstanceOf(HTMLSelectElement);

    await user.selectOptions(missionSelect, "Fairway Finder");

    await waitFor(() => expect(window.localStorage.getItem("golfiq.range.mission.v1")).toBe("fairway-finder"));

    const hitButton = screen.getByRole("button", { name: /Hit & analyze/i });
    await user.click(hitButton);
    await user.click(hitButton);
    await user.click(hitButton);

    await waitFor(() => expect(postRangeAnalyzeMock).toHaveBeenCalledTimes(3));

    const grooveMeter = await screen.findByText(/Good reps:/i);
    expect(grooveMeter.textContent).toMatch(/Good reps:/i);
    expect(screen.getAllByText(/Fairway Finder/).length).toBeGreaterThan(0);
  });
});
