import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import QuickRoundStartPage from "./QuickRoundStartPage";
import { DEMO_COURSE_NAME } from "@/features/quickround/constants";
import { fetchHeroCourses } from "@/api";

const defaultHeroCourses = [
  {
    id: "demo-links",
    name: DEMO_COURSE_NAME,
    country: "USA",
    city: "Palo Alto",
    tees: [
      { id: "white", label: "White" },
      { id: "blue", label: "Blue" },
    ],
    holes: 3,
    par: 12,
    lengthsByTee: { white: 985, blue: 1045 },
  },
];

vi.mock("@/api", () => ({
  fetchBundleIndex: vi.fn().mockResolvedValue([]),
  fetchHeroCourses: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (params && "count" in params) {
        return `${key.replace("{{count}}", String(params.count))}`;
      }
      return key;
    },
  }),
}));

const saveRound = vi.fn();

vi.mock("../../features/quickround/storage", () => ({
  createRoundId: () => "round-123",
  loadAllRounds: () => [],
  loadDefaultHandicap: () => null,
  saveDefaultHandicap: () => undefined,
  clearDefaultHandicap: () => undefined,
  saveRound: (...args: unknown[]) => saveRound(...args),
  QuickRoundSummary: {},
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

describe("QuickRoundStartPage hero courses", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.mocked(fetchHeroCourses).mockResolvedValue(defaultHeroCourses);
    saveRound.mockReset();
  });

  it("renders hero courses when available", async () => {
    render(
      <MemoryRouter>
        <QuickRoundStartPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Demo Links Hero")).toBeDefined();
    expect(screen.getByText("quickRound.start.heroCourses")).toBeDefined();
  });

  it("prefills course and tee when selecting a hero course", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <QuickRoundStartPage />
      </MemoryRouter>
    );

    const heroButton = await screen.findByRole("button", { name: /Demo Links Hero/i });
    await user.click(heroButton);

    const courseInput = screen.getByLabelText("quickRound.start.courseName") as HTMLInputElement;
    expect(courseInput.value).toBe(DEMO_COURSE_NAME);

    const teeSelect = screen.getByLabelText("quickRound.start.heroTeeLabel") as HTMLSelectElement;
    expect(teeSelect.value).toBe("white");

    const [startButton] = screen.getAllByRole("button", { name: "quickRound.start.startButton" });
    await user.click(startButton);

    await waitFor(() => expect(saveRound).toHaveBeenCalled());
    const savedRound = saveRound.mock.calls[0][0];
    expect(savedRound.courseId).toBe("demo-links");
  });

  it("uses selected holes count when no hero course is chosen", async () => {
    vi.mocked(fetchHeroCourses).mockResolvedValue([]);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <QuickRoundStartPage />
      </MemoryRouter>
    );

    const courseInput = await screen.findByLabelText(
      "quickRound.start.courseName"
    );
    await user.type(courseInput, "My Custom Course");

    const [nineHolesOption] = screen.getAllByLabelText(
      "quickRound.start.holesOption"
    );
    await user.click(nineHolesOption);

    const [startButton] = screen.getAllByRole("button", {
      name: "quickRound.start.startButton",
    });
    await user.click(startButton);

    await waitFor(() => expect(saveRound).toHaveBeenCalled());
    const savedRound = saveRound.mock.calls[0][0];
    expect(savedRound.holes).toHaveLength(9);
  });

  it("derives hole metadata from selected hero course", async () => {
    vi.mocked(fetchHeroCourses).mockResolvedValue([
      {
        id: "hero-short",
        name: "Hero Short",
        country: "USA",
        city: "SF",
        tees: [{ id: "white", label: "White" }],
        holes: 3,
        par: 9,
        lengthsByTee: { white: 720 },
        holeDetails: [
          { number: 1, par: 3 },
          { number: 2, par: 4 },
          { number: 3, par: 2 },
        ],
      },
    ]);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <QuickRoundStartPage />
      </MemoryRouter>
    );

    const heroButton = await screen.findByRole("button", { name: /Hero Short/i });
    await user.click(heroButton);

    const [startButton] = screen.getAllByRole("button", {
      name: "quickRound.start.startButton",
    });
    await user.click(startButton);

    await waitFor(() => expect(saveRound).toHaveBeenCalled());
    const savedRound = saveRound.mock.calls[0][0];
    expect(savedRound.holes).toHaveLength(3);
    expect(savedRound.holes[0]).toMatchObject({ index: 1, par: 3 });
    expect(savedRound.holes[2]).toMatchObject({ index: 3, par: 2 });
  });
});
