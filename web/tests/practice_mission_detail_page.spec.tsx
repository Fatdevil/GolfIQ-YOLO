import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import PracticeMissionDetailPage from "@/pages/practice/PracticeMissionDetailPage";
import type { PracticeMissionHistoryEntry } from "@shared/practice/practiceHistory";
import { createDefaultBag } from "@/bag/types";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/practice/practiceMissionHistory", async () => {
  const actual = await vi.importActual<typeof import("@/practice/practiceMissionHistory")>(
    "@/practice/practiceMissionHistory"
  );

  return {
    ...actual,
    loadPracticeMissionHistory: vi.fn(),
  };
});

vi.mock("@/bag/storage", () => ({
  loadBag: vi.fn(),
}));

import { loadPracticeMissionHistory } from "@/practice/practiceMissionHistory";
import { loadBag } from "@/bag/storage";

const mockLoadHistory = loadPracticeMissionHistory as unknown as Mock;
const mockLoadBag = loadBag as unknown as Mock;

describe("PracticeMissionDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadBag.mockReturnValue(createDefaultBag());
    navigateMock.mockReset();
  });

  it("renders detail text for a mission entry", async () => {
    const now = new Date();
    const history: PracticeMissionHistoryEntry[] = [
      {
        id: "entry-1",
        missionId: "mission-1",
        startedAt: now.toISOString(),
        endedAt: now.toISOString(),
        status: "completed",
        targetClubs: ["7i"],
        targetSampleCount: 30,
        completedSampleCount: 24,
      },
    ];
    mockLoadHistory.mockResolvedValue(history);
    mockLoadBag.mockReturnValue({
      ...createDefaultBag(),
      clubs: [
        { id: "7i", label: "7-iron", carry_m: null },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/practice/history/entry-1"]}>
        <Routes>
          <Route path="/practice/history/:id" element={<PracticeMissionDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Practice details/i)).toBeVisible();
    expect(screen.getByText(/7-iron/)).toBeVisible();
    expect(screen.getByText(/24 \/ 30 swings/)).toBeVisible();
    expect(screen.getByText('Contributed to your streak')).toBeVisible();
  });

  it("navigates to quick practice when repeating", async () => {
    const now = new Date();
    mockLoadHistory.mockResolvedValue([
      {
        id: "entry-1",
        missionId: "mission-1",
        startedAt: now.toISOString(),
        endedAt: now.toISOString(),
        status: "completed",
        targetClubs: ["7i"],
        targetSampleCount: 30,
        completedSampleCount: 18,
      },
    ]);
    mockLoadBag.mockReturnValue({
      ...createDefaultBag(),
      clubs: [
        { id: "7i", label: "7-iron", carry_m: null },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/practice/history/entry-1"]}>
        <Routes>
          <Route path="/practice/history/:id" element={<PracticeMissionDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const button = await screen.findByTestId("repeat-mission-button");
    fireEvent.click(button);

    expect(navigateMock).toHaveBeenCalledWith("/range/practice?missionId=mission-1&club=7i&targetSamples=30");
  });
});
