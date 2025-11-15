import axios from "axios";
import { describe, expect, it, vi, afterEach } from "vitest";

import { createTripRound, fetchTripRound, saveTripScores } from "../src/trip/api";
import type { TripRound } from "../src/trip/types";

const API_BASE = "http://localhost:8000/api/trip";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("trip api client", () => {
  it("creates a trip round", async () => {
    const mockRound: TripRound = {
      id: "trip_123",
      created_ts: Date.now(),
      course_name: "Test Course",
      holes: 9,
      players: [
        { id: "p1", name: "Alice", handicap: 5 },
        { id: "p2", name: "Bob", handicap: 8 },
      ],
      scores: [],
    };

    const postSpy = vi
      .spyOn(axios, "post")
      .mockResolvedValue({ data: mockRound } as never);

    const payload = {
      courseName: "Test Course",
      holes: 9,
      players: [
        { name: "Alice", handicap: 8.5 },
        { name: "Bob" },
      ],
    };

    const result = await createTripRound(payload);

    expect(result).toEqual(mockRound);
    expect(postSpy).toHaveBeenCalledWith(`${API_BASE}/rounds`, payload, {
      headers: { "Content-Type": "application/json" },
    });
  });

  it("wraps axios errors in TripApiError", async () => {
    const error = Object.assign(new Error("Request failed"), {
      isAxiosError: true,
      response: {
        status: 404,
        data: { detail: "trip_not_found" },
      },
    });

    vi.spyOn(axios, "get").mockRejectedValue(error);

    await expect(fetchTripRound("trip_missing")).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining("trip_not_found"),
    });
  });

  it("saves scores", async () => {
    const updated: TripRound = {
      id: "trip_123",
      created_ts: Date.now(),
      course_name: "Test Course",
      holes: 9,
      players: [{ id: "p1", name: "Alice", handicap: 3 }],
      scores: [{ hole: 1, player_id: "p1", strokes: 4 }],
    };

    const postSpy = vi
      .spyOn(axios, "post")
      .mockResolvedValueOnce({ data: updated } as never);

    const result = await saveTripScores("trip_123", [
      { hole: 1, player_id: "p1", strokes: 4 },
    ]);

    expect(result).toEqual(updated);
    expect(postSpy).toHaveBeenCalledWith(
      `${API_BASE}/rounds/trip_123/scores`,
      { scores: [{ hole: 1, player_id: "p1", strokes: 4 }] },
      { headers: { "Content-Type": "application/json" } }
    );
  });
});
