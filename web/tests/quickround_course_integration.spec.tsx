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

const fetchBundleIndexMock = vi.hoisted(() =>
  vi.fn(async () => [
    { courseId: "demo-links", name: "Demo Links", holes: 18, version: 1 },
  ])
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
  fetchBundleIndex: fetchBundleIndexMock,
  fetchHeroCourses: fetchHeroCoursesMock,
}));

describe("QuickRoundStartPage course integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadAllRoundsMock.mockReturnValue([]);
    loadDefaultHandicapMock.mockReturnValue(null);
    fetchBundleIndexMock.mockClear();
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

    await user.type(screen.getByLabelText(/Course name/i), "Testbanan");
    await screen.findByRole("option", { name: /Demo Links \(18\)/i });
    await user.selectOptions(screen.getByLabelText(/^Course$/i), "demo-links");
    await user.click(screen.getByRole("button", { name: /Start round/i }));

    expect(saveRoundMock).toHaveBeenCalledTimes(1);
    const savedRound = saveRoundMock.mock.calls[0][0];
    expect(savedRound.courseId).toBe("demo-links");
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

    await screen.findByRole("option", { name: /Demo Links \(18\)/i });
    expect(screen.getByLabelText(/^Course$/i)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText(/^Course$/i), "demo-links");
    const courseNameInput = screen.getByLabelText(/Course name/i) as HTMLInputElement;
    expect(courseNameInput.value).toBe("Demo Links");
  });
});
