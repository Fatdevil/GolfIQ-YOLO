import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TripScoreboardPage from "../src/pages/trip/TripScoreboardPage";
import type { TripRound } from "../src/trip/types";

const { fetchTripRoundMock, saveTripScoresMock, createTripShareTokenMock } =
  vi.hoisted(() => ({
    fetchTripRoundMock: vi.fn<(id: string) => Promise<TripRound>>(),
    saveTripScoresMock: vi.fn<
      (id: string, scores: TripRound["scores"])
      => Promise<TripRound>
    >(),
    createTripShareTokenMock: vi.fn<(tripId: string) => Promise<string>>(),
  }));

vi.mock("../src/trip/api", () => ({
  fetchTripRound: fetchTripRoundMock,
  saveTripScores: saveTripScoresMock,
  createTripShareToken: createTripShareTokenMock,
}));

describe("TripScoreboardPage", () => {
  const baseTrip: TripRound = {
    id: "trip_abc",
    created_ts: 123,
    course_name: "Test Course",
    tees_name: "Blue",
    holes: 3,
    players: [
      { id: "p1", name: "Alice", handicap: 4 },
      { id: "p2", name: "Bob", handicap: 10 },
    ],
    scores: [],
  };

  beforeEach(() => {
    fetchTripRoundMock.mockReset();
    saveTripScoresMock.mockReset();
    createTripShareTokenMock.mockReset();
    fetchTripRoundMock.mockResolvedValue(baseTrip);
    saveTripScoresMock.mockResolvedValue({ ...baseTrip });
    createTripShareTokenMock.mockResolvedValue("token123");
  });

  it("renders scoreboard and saves scores", async () => {
    const user = userEvent.setup();
    const updatedTrip: TripRound = {
      ...baseTrip,
      scores: [
        { hole: 1, player_id: "p1", strokes: 4 },
        { hole: 1, player_id: "p2", strokes: 5 },
      ],
    };

    fetchTripRoundMock.mockResolvedValueOnce(baseTrip);
    saveTripScoresMock.mockResolvedValueOnce(updatedTrip);

    render(
      <MemoryRouter initialEntries={["/trip/trip_abc"]}>
        <Routes>
          <Route path="/trip/:tripId" element={<TripScoreboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Trip scoreboard/i)).toBeTruthy();
    expect(screen.getAllByText("Alice")).toHaveLength(2);
    expect(screen.getAllByText("Bob")).toHaveLength(2);
    expect(screen.getByRole("columnheader", { name: /Net/i })).toBeTruthy();

    const aliceInput = screen.getByLabelText(/Hole 1 – Alice/i);
    const bobInput = screen.getByLabelText(/Hole 1 – Bob/i);

    await user.type(aliceInput, "4");
    await user.type(bobInput, "5");

    await user.click(screen.getByRole("button", { name: /Save scores/i }));

    expect(saveTripScoresMock).toHaveBeenCalledWith("trip_abc", [
      { hole: 1, player_id: "p1", strokes: 4 },
      { hole: 1, player_id: "p2", strokes: 5 },
    ]);

    expect(await screen.findByText("4")).toBeTruthy();
  });

  it("creates a share link and copies it", async () => {
    const user = userEvent.setup();
    const originalClipboard = navigator.clipboard;
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    try {
      render(
        <MemoryRouter initialEntries={["/trip/trip_abc"]}>
          <Routes>
            <Route path="/trip/:tripId" element={<TripScoreboardPage />} />
          </Routes>
        </MemoryRouter>
      );

      const shareButton = await screen.findByRole("button", {
        name: /Share scoreboard/i,
      });

      await user.click(shareButton);

      expect(createTripShareTokenMock).toHaveBeenCalledWith("trip_abc");
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/trip/share/token123`
      );
      expect(
        await screen.findByText(/Share link copied to clipboard/i)
      ).toBeTruthy();
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", {
          value: originalClipboard,
          configurable: true,
        });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (navigator as any).clipboard;
      }
    }
  });
});
