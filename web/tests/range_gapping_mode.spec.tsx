import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { UnitsContext } from "../src/preferences/UnitsContext";
import userEvent from "@testing-library/user-event";

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

const proAccessValue = {
  loading: false,
  plan: "pro" as PlanName,
  hasFeature: (_feature: FeatureId) => true,
};

function renderWithAccess(ui: ReactElement) {
  return render(
    <UserAccessContext.Provider value={proAccessValue}>
      <UnitsContext.Provider value={{ unit: "metric", setUnit: () => {} }}>
        {ui}
      </UnitsContext.Provider>
    </UserAccessContext.Provider>,
  );
}

describe("RangePracticePage gapping mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadBagMock.mockImplementation(() => ({
      updatedAt: Date.now(),
      clubs: [
        { id: "7i", label: "7-järn", carry_m: null },
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
  });

  it("computes stats and saves suggested carry", async () => {
    const user = userEvent.setup();

    postRangeAnalyzeMock
      .mockResolvedValueOnce({ carry_m: 100 })
      .mockResolvedValueOnce({ carry_m: 110 })
      .mockResolvedValueOnce({ carry_m: 120 });

    renderWithAccess(<RangePracticePage />);

    const hitButton = screen.getByRole("button", { name: /Hit & analyze/i });

    await user.click(hitButton);
    await waitFor(() => expect(postRangeAnalyzeMock).toHaveBeenCalledTimes(1));
    await user.click(hitButton);
    await waitFor(() => expect(postRangeAnalyzeMock).toHaveBeenCalledTimes(2));
    await user.click(hitButton);
    await waitFor(() => expect(postRangeAnalyzeMock).toHaveBeenCalledTimes(3));

    await user.click(screen.getByRole("button", { name: /Gapping/i }));

    await screen.findByText(/Antal slag: 3/);
    expect(screen.getByText(/Föreslagen carry/).textContent).toContain("110 m");

    const saveButton = screen.getByRole("button", { name: /Spara i Min bag/i });
    await user.click(saveButton);

    expect(loadBagMock).toHaveBeenCalledTimes(2);
    expect(updateClubCarryMock).toHaveBeenCalledWith(expect.any(Object), "7i", 110);
  });
});
