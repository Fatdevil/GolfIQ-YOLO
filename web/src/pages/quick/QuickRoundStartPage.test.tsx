import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import QuickRoundStartPage from "./QuickRoundStartPage";

vi.mock("@/api", () => ({
  fetchBundleIndex: vi.fn().mockResolvedValue([]),
  fetchHeroCourses: vi.fn().mockResolvedValue([
    {
      id: "demo-links",
      name: "Demo Links Hero",
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
  ]),
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
    expect(courseInput.value).toBe("Demo Links Hero");

    const teeSelect = screen.getByLabelText("quickRound.start.heroTeeLabel") as HTMLSelectElement;
    expect(teeSelect.value).toBe("white");

    const [startButton] = screen.getAllByRole("button", { name: "quickRound.start.startButton" });
    await user.click(startButton);

    await waitFor(() => expect(saveRound).toHaveBeenCalled());
    const savedRound = saveRound.mock.calls[0][0];
    expect(savedRound.courseId).toBe("demo-links");
  });
});
