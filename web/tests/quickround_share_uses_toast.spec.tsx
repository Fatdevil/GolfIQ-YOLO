import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import QuickRoundPlayPage from "../src/pages/quick/QuickRoundPlayPage";
import { NotificationProvider } from "../src/notifications/NotificationContext";
import { ToastContainer } from "../src/notifications/ToastContainer";
import type { QuickRound } from "../src/features/quickround/types";

const { loadRoundMock, saveRoundMock } = vi.hoisted(() => ({
  loadRoundMock: vi.fn(),
  saveRoundMock: vi.fn(),
}));

vi.mock("../src/features/quickround/storage", () => ({
  loadRound: loadRoundMock,
  saveRound: saveRoundMock,
}));

describe("QuickRound share uses toast", () => {
  it("shows a toast when the round summary is copied", async () => {
    const round: QuickRound = {
      id: "qr-toast",
      courseName: "Toast Course",
      holes: [
        { index: 1, par: 4, strokes: 4 },
        { index: 2, par: 4, strokes: 5 },
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
        <NotificationProvider>
          <MemoryRouter initialEntries={["/play/qr-toast"]}>
            <Routes>
              <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
            </Routes>
          </MemoryRouter>
          <ToastContainer />
        </NotificationProvider>
      );

      const button = await screen.findByRole("button", {
        name: /Copy round summary/i,
      });

      await user.click(button);

      await waitFor(() => {
        expect(writeText).toHaveBeenCalled();
      });

      const messages = await screen.findAllByText(/Round summary copied/i, {
        timeout: 2000,
      });

      expect(messages.length).toBeGreaterThan(0);
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
