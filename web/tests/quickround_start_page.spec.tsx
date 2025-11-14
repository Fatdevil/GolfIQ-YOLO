import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import QuickRoundStartPage from "../src/pages/quick/QuickRoundStartPage";
import { QuickRoundSummary } from "../src/features/quickround/storage";

const { saveRoundMock, loadAllRoundsMock, createRoundIdMock } = vi.hoisted(() => ({
  saveRoundMock: vi.fn(),
  loadAllRoundsMock: vi.fn(() => [] as QuickRoundSummary[]),
  createRoundIdMock: vi.fn(() => "qr-mock"),
}));

vi.mock("../src/features/quickround/storage", () => ({
  createRoundId: createRoundIdMock,
  loadAllRounds: loadAllRoundsMock,
  saveRound: saveRoundMock,
}));

describe("QuickRoundStartPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadAllRoundsMock.mockReturnValue([]);
  });

  it("creates a round and navigates to play view", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/play"]}>
        <Routes>
          <Route path="/play" element={<QuickRoundStartPage />} />
          <Route path="/play/:id" element={<div data-testid="play-page" />} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/Course name/i), "Testbanan");
    await user.click(screen.getByLabelText(/9 holes/i));
    await user.click(screen.getByRole("button", { name: /Start round/i }));

    expect(saveRoundMock).toHaveBeenCalledTimes(1);
    const savedRound = saveRoundMock.mock.calls[0][0];
    expect(savedRound.holes).toHaveLength(9);
    expect(savedRound.courseName).toBe("Testbanan");
    expect(savedRound.showPutts).toBe(true);
    expect(screen.getByTestId("play-page")).toBeTruthy();
  });

  it("renders previous rounds", () => {
    loadAllRoundsMock.mockReturnValueOnce([
      {
        id: "qr-1",
        courseName: "Bro Hof",
        startedAt: "2024-05-01T12:00:00.000Z",
        completedAt: undefined,
        teesName: "Gul",
      },
      {
        id: "qr-2",
        courseName: "Ullna",
        startedAt: "2024-05-02T12:00:00.000Z",
        completedAt: "2024-05-02T15:00:00.000Z",
        teesName: undefined,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/play"]}>
        <Routes>
          <Route path="/play" element={<QuickRoundStartPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Bro Hof")).toBeTruthy();
    expect(screen.getByText("Ullna")).toBeTruthy();
    expect(screen.getByText(/Klar/)).toBeTruthy();
    expect(screen.getByText(/Pågår/)).toBeTruthy();
  });
});
