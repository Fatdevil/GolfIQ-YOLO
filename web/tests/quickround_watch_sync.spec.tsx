import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import QuickRoundPlayPage from "../src/pages/quick/QuickRoundPlayPage";
import { QuickRound } from "../src/features/quickround/types";

const { loadRoundMock, saveRoundMock } = vi.hoisted(() => ({
  loadRoundMock: vi.fn(),
  saveRoundMock: vi.fn(),
}));

const syncMock = vi.fn();

vi.mock("../src/features/quickround/storage", () => ({
  loadRound: loadRoundMock,
  saveRound: saveRoundMock,
}));

vi.mock("../src/features/watch/api", () => ({
  syncQuickRoundToWatch: (...args: unknown[]) => syncMock(...args),
}));

describe("QuickRound watch sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncMock.mockResolvedValue({ deviceId: "dev1", synced: true });
  });

  it("shows synced status when a watch is paired", async () => {
    const round: QuickRound = {
      id: "qr-watch-1",
      runId: "run-1",
      memberId: "member-1",
      courseId: "course-1",
      courseName: "Watch Course",
      holes: [{ index: 1, par: 4 }],
      startedAt: new Date().toISOString(),
      showPutts: true,
    };
    loadRoundMock.mockReturnValueOnce(round);

    render(
      <MemoryRouter initialEntries={["/play/qr-watch-1"]}>
        <Routes>
          <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
        </Routes>
      </MemoryRouter>
    );

    const statuses = await screen.findAllByTestId("quickround-watch-status");
    const combinedText = statuses
      .map((node: HTMLElement) => node.textContent ?? "")
      .join(" ");
    await waitFor(() => {
      expect(syncMock).toHaveBeenCalledWith({
        memberId: "member-1",
        runId: "run-1",
        courseId: "course-1",
        hole: 1,
      });
    });
    expect(combinedText).toMatch(/Watch HUD/i);
    expect(combinedText).toMatch(/Synced|Synkad|Paired|Parat/i);
  });

  it("shows no watch state when sync reports no device", async () => {
    syncMock.mockResolvedValueOnce({ deviceId: null, synced: false });
    const round: QuickRound = {
      id: "qr-watch-2",
      runId: "run-2",
      memberId: "member-2",
      courseName: "Solo Course",
      holes: [{ index: 1, par: 3 }],
      startedAt: new Date().toISOString(),
      showPutts: true,
    };
    loadRoundMock.mockReturnValueOnce(round);

    render(
      <MemoryRouter initialEntries={["/play/qr-watch-2"]}>
        <Routes>
          <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
        </Routes>
      </MemoryRouter>
    );

    const statuses = await screen.findAllByTestId("quickround-watch-status");
    const combinedText = statuses
      .map((node: HTMLElement) => node.textContent ?? "")
      .join(" ");
    expect(combinedText).toMatch(/Watch HUD/i);
    expect(combinedText).toMatch(/No watch|Ingen klocka/i);
  });
});
