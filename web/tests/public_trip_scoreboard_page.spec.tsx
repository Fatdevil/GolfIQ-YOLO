import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import PublicTripScoreboardPage from "../src/pages/trip/PublicTripScoreboardPage";

const sampleResponse = {
  course_name: "Pebble Beach",
  tees_name: "Blue",
  holes: 3,
  created_ts: 1_700_000_000,
  players: [
    { id: "p1", name: "Alice" },
    { id: "p2", name: "Bob" },
  ],
  scores: [
    { hole: 1, player_id: "p1", strokes: 4 },
    { hole: 1, player_id: "p2", strokes: 5 },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("PublicTripScoreboardPage", () => {
  it("renders public trip data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(sampleResponse),
    } as unknown as Response);

    render(
      <MemoryRouter initialEntries={["/trip/share/abc"]}>
        <Routes>
          <Route path="/trip/share/:token" element={<PublicTripScoreboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Pebble Beach/)).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: /Alice/i })
    ).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /Bob/i })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/public/trip/rounds/abc");
  });

  it("handles not found tokens", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ detail: "trip_not_found" }),
    } as unknown as Response);

    render(
      <MemoryRouter initialEntries={["/trip/share/missing"]}>
        <Routes>
          <Route path="/trip/share/:token" element={<PublicTripScoreboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      await screen.findByText(/This trip scoreboard could not be found/i)
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open GolfIQ/i })).toBeTruthy();
  });
});
