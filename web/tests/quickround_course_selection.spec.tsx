import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import QuickRoundStartPage from "../src/pages/quick/QuickRoundStartPage";
import type { QuickRoundSummary } from "../src/features/quickround/storage";

const {
  saveRoundMock,
  loadAllRoundsMock,
  createRoundIdMock,
  loadDefaultHandicapMock,
  saveDefaultHandicapMock,
  clearDefaultHandicapMock,
  fetchBundleIndexMock,
  fetchHeroCoursesMock,
} = vi.hoisted(() => ({
  saveRoundMock: vi.fn(),
  loadAllRoundsMock: vi.fn(() => [] as QuickRoundSummary[]),
  createRoundIdMock: vi.fn(() => "qr-hero"),
  loadDefaultHandicapMock: vi.fn(() => null as number | null),
  saveDefaultHandicapMock: vi.fn(),
  clearDefaultHandicapMock: vi.fn(),
  fetchBundleIndexMock: vi.fn(),
  fetchHeroCoursesMock: vi.fn(),
}));

vi.mock("../src/features/quickround/storage", () => ({
  createRoundId: createRoundIdMock,
  loadAllRounds: loadAllRoundsMock,
  loadDefaultHandicap: loadDefaultHandicapMock,
  saveDefaultHandicap: saveDefaultHandicapMock,
  clearDefaultHandicap: clearDefaultHandicapMock,
  saveRound: saveRoundMock,
}));

vi.mock("@/api", () => ({
  fetchBundleIndex: fetchBundleIndexMock,
  fetchHeroCourses: fetchHeroCoursesMock,
}));

describe("QuickRoundStartPage course selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadAllRoundsMock.mockReturnValue([]);
    fetchBundleIndexMock.mockResolvedValue([
      { courseId: "hero-18", name: "Hero Ridge", holes: 18 },
      { courseId: "hero-9", name: "Nine Hills", holes: 9 },
    ]);
    fetchHeroCoursesMock.mockResolvedValue([]);
  });

  it("stores hero course metadata when starting a round", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/play"]}>
        <Routes>
          <Route path="/play" element={<QuickRoundStartPage />} />
          <Route path="/play/:id" element={<div data-testid="play-page" />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole("option", { name: /Hero Ridge \(18\)/i });
    const courseSelect = screen.getByLabelText(/^Course$/i);
    await user.selectOptions(courseSelect, "hero-18");

    const courseNameInput = screen.getByLabelText(/Course name/i) as HTMLInputElement;
    await waitFor(() => expect(courseNameInput.value).toBe("Hero Ridge"));

    await user.click(screen.getByRole("button", { name: /Start round/i }));

    expect(saveRoundMock).toHaveBeenCalledTimes(1);
    const savedRound = saveRoundMock.mock.calls[0][0];
    expect(savedRound.courseId).toBe("hero-18");
    expect(savedRound.courseName).toBe("Hero Ridge");
    expect(screen.getByTestId("play-page")).toBeTruthy();
  });
});
