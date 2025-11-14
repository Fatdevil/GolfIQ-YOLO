import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import QuickRoundPlayPage from "../src/pages/quick/QuickRoundPlayPage";
import { QuickRound } from "../src/features/quickround/types";

const { loadRoundMock, saveRoundMock } = vi.hoisted(() => ({
  loadRoundMock: vi.fn(),
  saveRoundMock: vi.fn(),
}));

vi.mock("../src/features/quickround/storage", () => ({
  loadRound: loadRoundMock,
  saveRound: saveRoundMock,
}));

describe("QuickRoundPlayPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates strokes and saves round", async () => {
    const round: QuickRound = {
      id: "qr-123",
      courseName: "Test Course",
      holes: [
        { index: 1, par: 4 },
        { index: 2, par: 4 },
        { index: 3, par: 4 },
      ],
      startedAt: "2024-05-01T12:00:00.000Z",
      showPutts: true,
    };
    loadRoundMock.mockReturnValueOnce(round);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/play/qr-123"]}>
        <Routes>
          <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
        </Routes>
      </MemoryRouter>
    );

    const strokesInput = await screen.findByLabelText("Slag hål 1");
    await user.clear(strokesInput);
    await user.type(strokesInput, "5");

    expect(saveRoundMock).toHaveBeenCalled();
    const savedRound = saveRoundMock.mock.calls.at(-1)?.[0] as QuickRound;
    expect(savedRound.holes[0].strokes).toBe(5);
  });

  it("marks round as completed", async () => {
    const round: QuickRound = {
      id: "qr-999",
      courseName: "Finish Course",
      holes: [{ index: 1, par: 4 }],
      startedAt: "2024-05-03T10:00:00.000Z",
      showPutts: true,
    };
    loadRoundMock.mockReturnValueOnce(round);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/play/qr-999"]}>
        <Routes>
          <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
        </Routes>
      </MemoryRouter>
    );

    const buttons = await screen.findAllByRole("button", { name: /Avsluta runda/i });
    await user.click(buttons[0]);

    expect(saveRoundMock).toHaveBeenCalled();
    const completionCall = saveRoundMock.mock.calls.at(-1)?.[0] as QuickRound;
    expect(completionCall.completedAt).toBeDefined();
  });

  it("renders not found state", () => {
    loadRoundMock.mockReturnValueOnce(null);

    render(
      <MemoryRouter initialEntries={["/play/missing"]}>
        <Routes>
          <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/Round not found/i)).toBeTruthy();
    expect(screen.getByText(/Back to start/i)).toBeTruthy();
  });
});
