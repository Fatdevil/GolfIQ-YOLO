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
  fetchCoursesMock,
  fetchCourseLayoutMock,
  fetchHeroCoursesMock,
} = vi.hoisted(() => ({
  saveRoundMock: vi.fn(),
  loadAllRoundsMock: vi.fn(() => [] as QuickRoundSummary[]),
  createRoundIdMock: vi.fn(() => "qr-hero"),
  loadDefaultHandicapMock: vi.fn(() => null as number | null),
  saveDefaultHandicapMock: vi.fn(),
  clearDefaultHandicapMock: vi.fn(),
  fetchCoursesMock: vi.fn(),
  fetchCourseLayoutMock: vi.fn(),
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
  fetchCourses: fetchCoursesMock,
  fetchCourseLayout: fetchCourseLayoutMock,
  fetchHeroCourses: fetchHeroCoursesMock,
}));

describe("QuickRoundStartPage course selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadAllRoundsMock.mockReturnValue([]);
    fetchCoursesMock.mockResolvedValue([
      { id: "hero-18", name: "Hero Ridge", holeCount: 18 },
      { id: "hero-9", name: "Nine Hills", holeCount: 9 },
    ]);
    fetchCourseLayoutMock.mockImplementation(async (courseId: string) => ({
      id: courseId,
      name: courseId === "hero-18" ? "Hero Ridge" : "Nine Hills",
      holes: Array.from(
        { length: courseId === "hero-18" ? 18 : 9 },
        (_, index) => ({
          number: index + 1,
          tee: { lat: 0, lon: 0 },
          green: { lat: 0, lon: 1 },
        })
      ),
    }));
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

    await screen.findByRole("option", { name: /Hero Ridge/i });
    const courseSelect = screen
      .getAllByLabelText(/^Course$/i)
      .find((element: HTMLElement) => element.tagName.toLowerCase() === "select");
    await user.selectOptions(courseSelect as HTMLSelectElement, "hero-18");

    const courseNameInput = screen.getAllByLabelText(/Course name/i)[0] as HTMLInputElement;
    await waitFor(() => expect(courseNameInput.value).toBe("Hero Ridge"));

    await user.click(screen.getByRole("button", { name: /Start round/i }));

    expect(saveRoundMock).toHaveBeenCalledTimes(1);
    const savedRound = saveRoundMock.mock.calls[0][0];
    expect(savedRound.courseId).toBe("hero-18");
    expect(savedRound.courseName).toBe("Hero Ridge");
    expect(screen.getByTestId("play-page")).toBeTruthy();
  });
});
