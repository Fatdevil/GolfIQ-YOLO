import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import QuickRoundPlayPage from "../src/pages/quick/QuickRoundPlayPage";
import type { QuickRound } from "../src/features/quickround/types";

const { loadRoundMock, saveRoundMock } = vi.hoisted(() => ({
  loadRoundMock: vi.fn(),
  saveRoundMock: vi.fn(),
}));

vi.mock("../src/features/quickround/storage", () => ({
  loadRound: loadRoundMock,
  saveRound: saveRoundMock,
}));

describe("QuickRoundPlayPage share summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadRoundMock.mockReset();
    saveRoundMock.mockReset();
  });

  it("copies the round summary to the clipboard", async () => {
    const round: QuickRound = {
      id: "qr-1",
      courseName: "Links Course",
      holes: [
        { index: 1, par: 3, strokes: 4 },
        { index: 2, par: 4, strokes: 3 },
        { index: 3, par: 3, strokes: 3 },
      ],
      startedAt: "2024-05-01T12:00:00.000Z",
      showPutts: true,
    };

    loadRoundMock.mockReturnValueOnce(round);

    const user = userEvent.setup();
    const originalClipboard = navigator.clipboard;
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    try {
      render(
        <MemoryRouter initialEntries={["/play/qr-1"]}>
          <Routes>
            <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
          </Routes>
        </MemoryRouter>
      );

      const button = await screen.findByRole("button", {
        name: /Copy round summary/i,
      });

      await user.click(button);

      expect(writeText).toHaveBeenCalledTimes(1);
      const summaryText = writeText.mock.calls[0]?.[0] as string;
      expect(summaryText).toContain("GolfIQ Quick Round – Links Course");
      expect(summaryText).toMatch(/Score: 10/);
      expect(summaryText).toMatch(/Holes: 3/);
      expect(
        await screen.findByText(/Round summary copied/i)
      ).toBeTruthy();
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", {
          value: originalClipboard,
          configurable: true,
        });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (navigator as any).clipboard;
      }
    }
  });
});
