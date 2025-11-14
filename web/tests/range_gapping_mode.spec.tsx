import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RangePracticePage from "../src/pages/RangePracticePage";
import type { BagState } from "../src/bag/types";

const { loadBagMock, updateClubCarryMock } = vi.hoisted(() => ({
  loadBagMock: vi.fn(),
  updateClubCarryMock: vi.fn(),
}));

vi.mock("../src/bag/storage", () => ({
  loadBag: loadBagMock,
  updateClubCarry: updateClubCarryMock,
}));

const { postMockAnalyzeMock } = vi.hoisted(() => ({
  postMockAnalyzeMock: vi.fn(),
}));

vi.mock("../src/api", () => ({
  postMockAnalyze: postMockAnalyzeMock,
}));

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

    postMockAnalyzeMock
      .mockResolvedValueOnce({ metrics: { carry_m: 100 } })
      .mockResolvedValueOnce({ metrics: { carry_m: 110 } })
      .mockResolvedValueOnce({ metrics: { carry_m: 120 } });

    render(<RangePracticePage />);

    const hitButton = screen.getByRole("button", { name: /Hit & analyze/i });

    await user.click(hitButton);
    await waitFor(() => expect(postMockAnalyzeMock).toHaveBeenCalledTimes(1));
    await user.click(hitButton);
    await waitFor(() => expect(postMockAnalyzeMock).toHaveBeenCalledTimes(2));
    await user.click(hitButton);
    await waitFor(() => expect(postMockAnalyzeMock).toHaveBeenCalledTimes(3));

    await user.click(screen.getByRole("button", { name: /Gapping/i }));

    await screen.findByText(/Antal slag: 3/);
    expect(screen.getByText(/Föreslagen carry/).textContent).toContain("110.0 m");

    const saveButton = screen.getByRole("button", { name: /Spara i Min bag/i });
    await user.click(saveButton);

    expect(loadBagMock).toHaveBeenCalledTimes(2);
    expect(updateClubCarryMock).toHaveBeenCalledWith(expect.any(Object), "7i", 110);
  });
});
