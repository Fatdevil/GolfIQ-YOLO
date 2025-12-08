import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import QuickRoundPlayPage from "../src/pages/quick/QuickRoundPlayPage";
import type { QuickRound } from "../src/features/quickround/types";
import { QuickRoundTestProviders } from "./helpers/quickroundProviders";

const { loadRoundMock, saveRoundMock } = vi.hoisted(() => ({
  loadRoundMock: vi.fn(),
  saveRoundMock: vi.fn(),
}));

vi.mock("../src/features/quickround/storage", () => ({
  loadRound: loadRoundMock,
  saveRound: saveRoundMock,
}));
vi.mock("../src/user/historyApi", () => ({
  postQuickRoundSnapshots: vi.fn(),
}));

const toastMock = vi.fn();

vi.mock("../src/notifications/NotificationContext", async () => {
  const actual = await vi.importActual<
    typeof import("../src/notifications/NotificationContext")
  >("../src/notifications/NotificationContext");
  return {
    ...actual,
    useNotifications: () => ({
      notifications: [],
      notify: toastMock,
      dismiss: vi.fn(),
    }),
  };
});

describe("QuickRound share uses toast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toastMock.mockReset();
  });

  it("shows a toast when the round summary is copied", async () => {
    const round: QuickRound = {
      id: "qr-toast",
      courseName: "Toast Course",
      holes: [
        { index: 1, par: 3, strokes: 4 },
        { index: 2, par: 4, strokes: 3 },
      ],
      startedAt: "2024-05-10T10:00:00.000Z",
      showPutts: true,
    };

    loadRoundMock.mockReturnValueOnce(round);

    const user = userEvent.setup();

    render(
      <QuickRoundTestProviders initialEntries={["/play/qr-toast"]}>
        <Routes>
          <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
        </Routes>
      </QuickRoundTestProviders>,
    );

    const button = await screen.findByRole("button", { name: /Copy round summary/i });
    await user.click(button);

    await screen.findByText(/Round summary copied/i);
    expect(toastMock).toHaveBeenCalled();
  });
});
