import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import QuickRoundPlayPage from "../src/pages/quick/QuickRoundPlayPage";
import { NotificationProvider } from "../src/notifications/NotificationContext";
import type { QuickRound } from "../src/features/quickround/types";
import { UserSessionProvider } from "../src/user/UserSessionContext";

const {
  loadRoundMock,
  saveRoundMock,
  useGeolocationMock,
  detectHoleMock,
} = vi.hoisted(() => ({
  loadRoundMock: vi.fn(),
  saveRoundMock: vi.fn(),
  useGeolocationMock: vi.fn(),
  detectHoleMock: vi.fn(),
}));

vi.mock("../src/features/quickround/storage", () => ({
  loadRound: loadRoundMock,
  saveRound: saveRoundMock,
}));

vi.mock("../src/hooks/useGeolocation", () => ({
  useGeolocation: useGeolocationMock,
}));

vi.mock("../src/api/holeDetect", () => ({
  detectHole: detectHoleMock,
}));

vi.mock("../src/user/historyApi", () => ({
  postQuickRoundSnapshots: vi.fn(),
}));

describe("QuickRoundPlayPage auto hole suggestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGeolocationMock.mockReturnValue({ position: { lat: 59.3, lon: 18.1 } });
    detectHoleMock.mockResolvedValue({
      hole: 5,
      distance_m: 87,
      confidence: 0.91,
      reason: "closest_green",
    });
  });

  it("shows suggestion banner and jumps to suggested hole on accept", async () => {
    const round: QuickRound = {
      id: "qr-auto",
      courseId: "hero_1",
      courseName: "Demo Links",
      holes: [
        { index: 1, par: 4, strokes: 4 },
        { index: 2, par: 3, strokes: 3 },
        { index: 3, par: 5, strokes: 5 },
        { index: 4, par: 4 },
        { index: 5, par: 4 },
      ],
      startedAt: "2024-06-01T09:00:00.000Z",
      showPutts: true,
    };
    loadRoundMock.mockReturnValueOnce(round);

    const user = userEvent.setup();

    render(
      <UserSessionProvider>
        <NotificationProvider>
          <MemoryRouter initialEntries={["/play/qr-auto"]}>
            <Routes>
              <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </UserSessionProvider>
    );

    expect(await screen.findByText(/Aktivt hål: 4/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(/Suggested hole: 5/i)).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: /Go to hole/i }));

    await waitFor(() => {
      expect(screen.getByText(/Aktivt hål: 5/i)).toBeTruthy();
    });
  });

  it("does not show banner when suggestion matches current hole", async () => {
    detectHoleMock.mockResolvedValueOnce({
      hole: 4,
      distance_m: 12,
      confidence: 0.5,
      reason: "stay_on_current",
    });
    const round: QuickRound = {
      id: "qr-auto",
      courseId: "hero_1",
      courseName: "Demo Links",
      holes: [
        { index: 1, par: 4, strokes: 4 },
        { index: 2, par: 3, strokes: 3 },
        { index: 3, par: 5, strokes: 5 },
        { index: 4, par: 4 },
      ],
      startedAt: "2024-06-01T09:00:00.000Z",
      showPutts: true,
    };
    loadRoundMock.mockReturnValueOnce(round);

    render(
      <UserSessionProvider>
        <NotificationProvider>
          <MemoryRouter initialEntries={["/play/qr-auto"]}>
            <Routes>
              <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </UserSessionProvider>
    );

    await waitFor(() => {
      expect(detectHoleMock).toHaveBeenCalled();
    });

    expect(screen.queryByText(/Suggested hole/i)).toBeNull();
  });
});
