import { MemoryRouter, Route, Routes } from "react-router-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TripScoreboardPage from "../src/pages/trip/TripScoreboardPage";
import { NotificationProvider } from "../src/notifications/NotificationContext";
import type { TripRound } from "../src/trip/types";

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

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

describe("TripScoreboardPage live updates", () => {
  const baseTrip: TripRound = {
    id: "trip_live",
    created_ts: 1,
    course_name: "Live Course",
    tees_name: "Blue",
    holes: 3,
    players: [
      { id: "p1", name: "Alice", handicap: 5 },
      { id: "p2", name: "Bob", handicap: 12 },
    ],
    scores: [],
    course_id: null,
    public_token: null,
  };

  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    fetchTripRoundMock.mockReset();
    saveTripScoresMock.mockReset();
    createTripShareTokenMock.mockReset();
    fetchTripRoundMock.mockResolvedValue(baseTrip);
    saveTripScoresMock.mockResolvedValue(baseTrip);
    createTripShareTokenMock.mockResolvedValue("token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updates scoreboard when SSE delivers new scores", async () => {
    render(
      <NotificationProvider>
        <MemoryRouter initialEntries={["/trip/trip_live"]}>
          <Routes>
            <Route path="/trip/:tripId" element={<TripScoreboardPage />} />
          </Routes>
        </MemoryRouter>
      </NotificationProvider>
    );

    const aliceInput = await screen.findByLabelText(/Hole 1 – Alice/i);
    expect((aliceInput as HTMLInputElement).value).toBe("");

    const updatedTrip: TripRound = {
      ...baseTrip,
      scores: [
        { hole: 1, player_id: "p1", strokes: 4 },
        { hole: 1, player_id: "p2", strokes: 5 },
      ],
    };

    const source = await waitFor(() => {
      const instance = MockEventSource.instances[0];
      expect(instance).toBeDefined();
      return instance;
    });

    await act(async () => {
      source.emit(updatedTrip);
    });

    await waitFor(() => {
      expect((aliceInput as HTMLInputElement).value).toBe("4");
    });

    expect(await screen.findByText(/Live updating/i)).toBeTruthy();
  });
});
