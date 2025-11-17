import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import TripScoreboardPage from "../src/pages/trip/TripScoreboardPage";
import { NotificationProvider } from "../src/notifications/NotificationContext";
import type { TripRound } from "../src/trip/types";

const { fetchTripRoundMock } = vi.hoisted(() => ({
  fetchTripRoundMock: vi.fn<(id: string) => Promise<TripRound>>(),
}));

vi.mock("../src/trip/api", () => ({
  fetchTripRound: fetchTripRoundMock,
  saveTripScores: vi.fn(),
  createTripShareToken: vi.fn(),
}));

describe("TripScoreboardPage net leaderboard", () => {
  beforeEach(() => {
    fetchTripRoundMock.mockReset();
  });

  it("displays gross, handicap and net columns sorted by net", async () => {
    const trip: TripRound = {
      id: "trip_net",
      created_ts: 1,
      course_name: "Net Course",
      tees_name: "White",
      holes: 2,
      players: [
        { id: "p1", name: "Casey", handicap: 2 },
        { id: "p2", name: "Drew", handicap: 8 },
      ],
      scores: [
        { hole: 1, player_id: "p1", strokes: 5 },
        { hole: 2, player_id: "p1", strokes: 5 },
        { hole: 1, player_id: "p2", strokes: 6 },
        { hole: 2, player_id: "p2", strokes: 6 },
      ],
      course_id: null,
      public_token: null,
    };

    fetchTripRoundMock.mockResolvedValueOnce(trip);

    render(
      <NotificationProvider>
        <MemoryRouter initialEntries={["/trip/trip_net"]}>
          <Routes>
            <Route path="/trip/:tripId" element={<TripScoreboardPage />} />
          </Routes>
        </MemoryRouter>
      </NotificationProvider>
    );

    const tables = await screen.findAllByRole("table");
    const leaderboardTable = tables.find((table: HTMLElement) => {
      const utils = within(table);
      return (
        utils.queryByText(/Gross/i) !== null && utils.queryByText(/Net/i) !== null
      );
    });

    expect(leaderboardTable).toBeTruthy();
    if (!leaderboardTable) {
      return;
    }

    const rows = within(leaderboardTable).getAllByRole("row");
    expect(rows).toHaveLength(3);

    const header = rows[0];
    expect(within(header).getByText(/Gross/i)).toBeTruthy();
    expect(within(header).getByText(/Hcp/i)).toBeTruthy();
    expect(within(header).getByText(/Net/i)).toBeTruthy();

    const firstDataRow = rows[1];
    const secondDataRow = rows[2];

    expect(within(firstDataRow).getByText("Drew")).toBeTruthy();
    expect(within(firstDataRow).getByText("12")).toBeTruthy();
    expect(within(firstDataRow).getByText("8.0")).toBeTruthy();
    expect(within(firstDataRow).getByText("4.0")).toBeTruthy();

    expect(within(secondDataRow).getByText("Casey")).toBeTruthy();
    expect(within(secondDataRow).getByText("10")).toBeTruthy();
    expect(within(secondDataRow).getByText("2.0")).toBeTruthy();
    expect(within(secondDataRow).getByText("8.0")).toBeTruthy();
  });
});
