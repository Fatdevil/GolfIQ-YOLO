import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import QuickRoundStartPage from "../src/pages/quick/QuickRoundStartPage";
import type { QuickRoundSummary } from "../src/features/quickround/storage";

const { saveRoundMock, loadAllRoundsMock, createRoundIdMock } = vi.hoisted(() => ({
  saveRoundMock: vi.fn(),
  loadAllRoundsMock: vi.fn(() => [] as QuickRoundSummary[]),
  createRoundIdMock: vi.fn(() => "qr-mock"),
}));

vi.mock("../src/features/quickround/storage", () => ({
  createRoundId: createRoundIdMock,
  loadAllRounds: loadAllRoundsMock,
  saveRound: saveRoundMock,
}));

const demoBundle = {
  id: "demo-links",
  name: "Demo Links",
  country: "USA",
  holes: [],
  version: 1,
};

vi.mock("../src/courses/hooks", () => ({
  useCourseIds: () => ({ data: [demoBundle.id], loading: false, error: undefined }),
  useCourseBundle: (courseId?: string) => ({
    data: courseId ? demoBundle : undefined,
    loading: false,
    error: undefined,
  }),
}));

describe("QuickRoundStartPage course integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadAllRoundsMock.mockReturnValue([]);
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
    await user.selectOptions(screen.getByLabelText(/Course \(demo bundle\)/i), "demo-links");
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

    expect(screen.getByLabelText(/Course \(demo bundle\)/i)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText(/Course \(demo bundle\)/i), "demo-links");
    expect(screen.getByText(/Demo Links/)).toBeTruthy();
  });
});
