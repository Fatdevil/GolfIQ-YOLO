import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import QuickRoundStartPage from "../src/pages/quick/QuickRoundStartPage";
import { QuickRoundSummary } from "../src/features/quickround/storage";

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

const demoCourseLayout = {
  id: "demo-links-hero",
  name: "Demo Links Hero",
  holes: Array.from({ length: 9 }, (_, index) => ({
    number: index + 1,
    tee: { lat: 0, lon: 0 },
    green: { lat: 0, lon: 1 },
  })),
};

const fetchCoursesMock = vi.hoisted(() =>
  vi.fn(async () => [
    {
      id: "demo-links-hero",
      name: "Demo Links Hero",
      holeCount: 5,
      country: null,
      city: null,
      location: null as { lat: number; lon: number } | null,
    },
  ])
);
const fetchCourseLayoutMock = vi.hoisted(() => vi.fn(async () => demoCourseLayout));
const fetchHeroCoursesMock = vi.hoisted(() => vi.fn(async () => []));
const useAutoHoleSuggestMock = vi.hoisted(() =>
  vi.fn(() => ({ suggestedHole: null, distanceToSuggestedM: null }))
);
const useGeolocationMock = vi.hoisted(() =>
  vi.fn(
    () =>
      ({
        position: null as { lat: number; lon: number } | null,
        error: null,
        supported: false,
        loading: false,
      })
  )
);

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

vi.mock("@/hooks/useAutoHoleSuggest", () => ({
  useAutoHoleSuggest: useAutoHoleSuggestMock,
}));
vi.mock("@/hooks/useGeolocation", () => ({
  useGeolocation: useGeolocationMock,
}));

describe("QuickRoundStartPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    loadAllRoundsMock.mockReturnValue([]);
    loadDefaultHandicapMock.mockReturnValue(null);
    fetchCoursesMock.mockResolvedValue([
      {
        id: "demo-links-hero",
        name: "Demo Links Hero",
        holeCount: 5,
        country: null,
        city: null,
        location: null,
      },
    ]);
    fetchCourseLayoutMock.mockResolvedValue(demoCourseLayout);
    fetchHeroCoursesMock.mockResolvedValue([]);
    useAutoHoleSuggestMock.mockReturnValue({
      suggestedHole: null,
      distanceToSuggestedM: null,
    });
    useGeolocationMock.mockReturnValue({ position: null, error: null, supported: false, loading: false });
  });

  it("creates a round and navigates to play view", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/play"]}>
        <Routes>
          <Route path="/play" element={<QuickRoundStartPage />} />
          <Route path="/play/:id" element={<div data-testid="play-page" />} />
        </Routes>
      </MemoryRouter>
    );

    const selectElements = await screen.findAllByLabelText(/Course/i);
    const courseSelect = selectElements.find(
      (element: HTMLElement) => element.tagName.toLowerCase() === "select"
    ) as HTMLSelectElement;
    expect(courseSelect).toBeTruthy();
    await user.selectOptions(courseSelect, "demo-links-hero");
    await user.click(screen.getByLabelText(/9 holes/i));
    await user.click(screen.getByRole("button", { name: /Start round/i }));

    expect(saveRoundMock).toHaveBeenCalledTimes(1);
    const savedRound = saveRoundMock.mock.calls[0][0];
    expect(savedRound.holes).toHaveLength(9);
    expect(savedRound.courseName).toBe("Demo Links Hero");
    expect(savedRound.showPutts).toBe(true);
    expect(screen.getByTestId("play-page")).toBeTruthy();
  });

  it("populates course dropdown and forwards layout to auto-hole suggest", async () => {
    render(
      <MemoryRouter initialEntries={["/play"]}>
        <Routes>
          <Route path="/play" element={<QuickRoundStartPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Demo Links Hero/ })).toBeTruthy();
    });

    await waitFor(() => {
      expect(fetchCourseLayoutMock).toHaveBeenCalledWith("demo-links-hero");
    });

    expect(useAutoHoleSuggestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "demo-links-hero",
        holes: expect.arrayContaining([
          expect.objectContaining({ number: 1 }),
          expect.objectContaining({ number: 2 }),
        ]),
      }),
      expect.anything()
    );
  });

  it("auto-selects the nearest course when GPS is available", async () => {
    fetchCoursesMock.mockResolvedValueOnce([
      {
        id: "near-course",
        name: "Near Course",
        holeCount: 9,
        country: null,
        city: null,
        location: { lat: 59.3, lon: 18.1 },
      },
      {
        id: "far-course",
        name: "Far Course",
        holeCount: 9,
        country: null,
        city: null,
        location: { lat: 0, lon: 0 },
      },
    ]);
    useGeolocationMock.mockReturnValue({
      position: { lat: 59.3002, lon: 18.0999 },
      error: null,
      supported: true,
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={["/play"]}>
        <Routes>
          <Route path="/play" element={<QuickRoundStartPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole("option", { name: /Near Course/ });
    const selectElements = await screen.findAllByLabelText(/Course/i);
    const courseSelect = selectElements.find(
      (element: HTMLElement) => element.tagName.toLowerCase() === "select"
    ) as HTMLSelectElement;

    await waitFor(() => expect(courseSelect.value).toBe("near-course"));
    expect(screen.getByText(/GPS suggests Near Course/)).toBeInTheDocument();
  });

  it("persists handicap defaults when provided", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/play"]}>
        <Routes>
          <Route path="/play" element={<QuickRoundStartPage />} />
          <Route path="/play/:id" element={<div data-testid="play-page" />} />
        </Routes>
      </MemoryRouter>
    );

    const courseInput = screen.getAllByLabelText(/Course name/i)[0];
    await user.clear(courseInput);
    await user.type(courseInput, "My Course");
    const handicapInput = screen.getAllByLabelText(/Handicap/i)[0];
    await user.clear(handicapInput);
    await user.type(handicapInput, "12.4");
    expect((handicapInput as HTMLInputElement).value).toBe("12.4");
    const startButton = screen.getAllByRole("button", { name: /Start round/i })[0];
    await user.click(startButton);
    const form = startButton.closest("form");
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    expect(saveDefaultHandicapMock).toHaveBeenCalledWith(12.4);
    await waitFor(() => expect(saveRoundMock).toHaveBeenCalled());
    const savedRound = saveRoundMock.mock.calls.at(-1)?.[0];
    expect(savedRound.handicap).toBe(12.4);
  });

  it("renders previous rounds", () => {
    loadAllRoundsMock.mockReturnValueOnce([
      {
        id: "qr-1",
        courseName: "Bro Hof",
        startedAt: "2024-05-01T12:00:00.000Z",
        completedAt: undefined,
        teesName: "Gul",
      },
      {
        id: "qr-2",
        courseName: "Ullna",
        startedAt: "2024-05-02T12:00:00.000Z",
        completedAt: "2024-05-02T15:00:00.000Z",
        teesName: undefined,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/play"]}>
        <Routes>
          <Route path="/play" element={<QuickRoundStartPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Bro Hof")).toBeTruthy();
    expect(screen.getByText("Ullna")).toBeTruthy();
    expect(screen.getByText(/Klar/)).toBeTruthy();
    expect(screen.getByText(/Pågår/)).toBeTruthy();
  });
});
