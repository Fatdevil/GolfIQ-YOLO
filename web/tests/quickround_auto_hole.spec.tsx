import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import QuickRoundPlayPage from "../src/pages/quick/QuickRoundPlayPage";
import type { QuickRound } from "../src/features/quickround/types";
import { QuickRoundTestProviders } from "./helpers/quickroundProviders";

const { loadRoundMock, saveRoundMock, useGeolocationMock } = vi.hoisted(() => {
  const useGeolocationMock = vi.fn<
    () => import("../src/hooks/useGeolocation").GeolocationState
  >(() => ({
    position: null,
    error: null,
    supported: false,
    loading: false,
  }));

  return {
    loadRoundMock: vi.fn(),
    saveRoundMock: vi.fn(),
    useGeolocationMock,
  };
});

vi.mock("../src/features/quickround/storage", () => ({
  loadRound: loadRoundMock,
  saveRound: saveRoundMock,
}));

vi.mock("../src/hooks/useGeolocation", () => ({
  useGeolocation: useGeolocationMock,
}));

vi.mock("../src/user/historyApi", () => ({
  postQuickRoundSnapshots: vi.fn(),
}));

describe("QuickRoundPlayPage auto hole suggestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGeolocationMock.mockReturnValue({
      position: { lat: 59.2966, lon: 18.106 },
      error: null,
      supported: true,
      loading: false,
    });
  });

  it("shows suggestion banner and jumps to suggested hole on accept", async () => {
    const round: QuickRound = {
      id: "qr-auto",
      courseId: "demo-links",
      courseName: "Demo Links Hero",
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
      <QuickRoundTestProviders initialEntries={["/play/qr-auto"]}>
        <Routes>
          <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
        </Routes>
      </QuickRoundTestProviders>,
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
    useGeolocationMock.mockReturnValue({
      position: { lat: 59.2976, lon: 18.1031 },
      error: null,
      supported: true,
      loading: false,
    });
    const round: QuickRound = {
      id: "qr-auto",
      courseId: "demo-links",
      courseName: "Demo Links Hero",
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
      <QuickRoundTestProviders initialEntries={["/play/qr-auto"]}>
        <Routes>
          <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
        </Routes>
      </QuickRoundTestProviders>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Suggested hole/i)).toBeNull();
    });
  });
});
