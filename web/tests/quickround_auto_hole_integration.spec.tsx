import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";

import QuickRoundPlayPage from "../src/pages/quick/QuickRoundPlayPage";
import { NotificationProvider } from "../src/notifications/NotificationContext";
import type { QuickRound } from "../src/features/quickround/types";
import { UserSessionProvider } from "../src/user/UserSessionContext";

const { loadRoundMock, saveRoundMock, useGeolocationMock, useAutoHoleSuggestionMock, clearSuggestionMock } = vi.hoisted(() => ({
  loadRoundMock: vi.fn(),
  saveRoundMock: vi.fn(),
  useGeolocationMock: vi.fn(),
  useAutoHoleSuggestionMock: vi.fn(),
  clearSuggestionMock: vi.fn(),
}));

vi.mock("../src/features/quickround/storage", () => ({
  loadRound: loadRoundMock,
  saveRound: saveRoundMock,
}));

vi.mock("../src/hooks/useGeolocation", () => ({
  useGeolocation: useGeolocationMock,
}));

vi.mock("../src/courses/useAutoHole", () => ({
  useAutoHoleSuggestion: useAutoHoleSuggestionMock,
}));
vi.mock("../src/user/historyApi", () => ({
  postQuickRoundSnapshots: vi.fn(),
}));

describe("QuickRoundPlayPage auto-hole integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGeolocationMock.mockReturnValue({ position: { lat: 59.3, lon: 18.1 } });
    useAutoHoleSuggestionMock.mockImplementation(({ enabled }: { enabled: boolean }) => {
      if (enabled) {
        return {
          suggestion: {
            suggestedHole: 3,
            confidence: 0.9,
            reason: "closest_tee",
          },
          clear: clearSuggestionMock,
        };
      }
      return { suggestion: null, clear: clearSuggestionMock };
    });
  });

  it("shows toast and switches hole when accepting auto suggestion", async () => {
    const round: QuickRound = {
      id: "qr-auto",
      courseId: "demo-links",
      courseName: "Demo Links",
      holes: [
        { index: 1, par: 4 },
        { index: 2, par: 3 },
        { index: 3, par: 5 },
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

    expect(await screen.findByText(/Aktivt hål: 1/i)).toBeTruthy();

    const toggle = await screen.findByLabelText(/Auto hole detect \(beta\)/i);
    await user.click(toggle);

    expect(await screen.findByText(/Byt till hål 3/i)).toBeTruthy();

    const acceptButton = screen.getByRole("button", { name: /Byt/i });
    await user.click(acceptButton);

    await waitFor(() => {
      expect(screen.getByText(/Aktivt hål: 3/i)).toBeTruthy();
    });

    expect(clearSuggestionMock).toHaveBeenCalled();
  });
});
