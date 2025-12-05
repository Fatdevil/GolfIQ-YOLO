import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
} = vi.hoisted(() => ({
  saveRoundMock: vi.fn(),
  loadAllRoundsMock: vi.fn(() => [] as QuickRoundSummary[]),
  createRoundIdMock: vi.fn(() => "qr-mock"),
  loadDefaultHandicapMock: vi.fn(() => null as number | null),
  saveDefaultHandicapMock: vi.fn(),
  clearDefaultHandicapMock: vi.fn(),
}));

const fetchCoursesMock = vi.hoisted(() =>
  vi.fn(async () => [
    { id: "demo-links-hero", name: "Demo Links Hero", holeCount: 9 },
  ])
);
const fetchCourseLayoutMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: "demo-links-hero",
    name: "Demo Links Hero",
    holes: Array.from({ length: 9 }, (_, index) => ({
      number: index + 1,
      tee: { lat: 0, lon: 0 },
      green: { lat: 0, lon: 1 },
    })),
  }))
);
const fetchHeroCoursesMock = vi.hoisted(() => vi.fn(async () => []));

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

describe("QuickRoundStartPage course integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadAllRoundsMock.mockReturnValue([]);
    loadDefaultHandicapMock.mockReturnValue(null);
    fetchCoursesMock.mockClear();
    fetchCourseLayoutMock.mockClear();
    fetchHeroCoursesMock.mockResolvedValue([]);
  });

  it("saves selected course id", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/play"]}>
        <Routes>
          <Route path="/play" element={<QuickRoundStartPage />} />
          <Route path="/play/:id" element={<div data-testid="play-page" />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole("option", { name: /Demo Links Hero/i });
    const courseSelect = screen
      .getAllByLabelText(/^Course$/i)
      .find((element: HTMLElement) => element.tagName.toLowerCase() === "select");
    await user.selectOptions(courseSelect as HTMLSelectElement, "demo-links-hero");
    await user.click(screen.getByRole("button", { name: /Start round/i }));

    expect(saveRoundMock).toHaveBeenCalledTimes(1);
    const savedRound = saveRoundMock.mock.calls[0][0];
    expect(savedRound.courseId).toBe("demo-links-hero");
    expect(screen.getByTestId("play-page")).toBeTruthy();
  });

  it("renders course selector when ids are available", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/play"]}>
        <Routes>
          <Route path="/play" element={<QuickRoundStartPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole("option", { name: /Demo Links Hero/i });
    expect(screen.getByLabelText(/^Course$/i)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText(/^Course$/i), "demo-links-hero");
    const courseNameInput = screen.getAllByLabelText(/Course name/i)[0] as HTMLInputElement;
    expect(courseNameInput.value).toBe("Demo Links Hero");
  });
});
