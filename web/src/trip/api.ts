import axios from "axios";

import { API, withAuth } from "../api";
import type { TripHoleScore, TripRound } from "./types";

const TRIP_BASE = `${API}/api/trip`;

export class TripApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "TripApiError";
    this.status = status;
  }
}

function toTripApiError(action: string, error: unknown): TripApiError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const detail =
      typeof error.response?.data === "object" && error.response?.data !== null
        ? (error.response?.data as { detail?: string }).detail
        : undefined;
    const baseMessage = detail || error.message;
    return new TripApiError(`${action} failed: ${baseMessage}`, status);
  }
  return new TripApiError(`${action} failed: ${String(error)}`);
}

export type TripRoundCreatePlayerInput = {
  name: string;
  handicap?: number | null;
};

export type TripRoundCreateInput = {
  courseName: string;
  courseId?: string;
  teesName?: string;
  holes: number;
  players: TripRoundCreatePlayerInput[];
};

export async function createTripRound(
  input: TripRoundCreateInput
): Promise<TripRound> {
  try {
    const { data } = await axios.post<TripRound>(`${TRIP_BASE}/rounds`, input, {
      headers: withAuth({ "Content-Type": "application/json" }),
    });
    return data;
  } catch (error) {
    throw toTripApiError("createTripRound", error);
  }
}

export async function fetchTripRound(id: string): Promise<TripRound> {
  try {
    const { data } = await axios.get<TripRound>(`${TRIP_BASE}/rounds/${id}`, {
      headers: withAuth(),
    });
    return data;
  } catch (error) {
    throw toTripApiError("fetchTripRound", error);
  }
}

export async function saveTripScores(
  id: string,
  scores: TripHoleScore[]
): Promise<TripRound> {
  try {
    const { data } = await axios.post<TripRound>(
      `${TRIP_BASE}/rounds/${id}/scores`,
      { scores },
      {
        headers: withAuth({ "Content-Type": "application/json" }),
      }
    );
    return data;
  } catch (error) {
    throw toTripApiError("saveTripScores", error);
  }
}

export async function createTripShareToken(tripId: string): Promise<string> {
  const response = await fetch(`${TRIP_BASE}/rounds/${tripId}/share`, {
    method: "POST",
    headers: withAuth({ "Content-Type": "application/json" }),
  });

  if (!response.ok) {
    throw new TripApiError(
      `createTripShareToken failed: ${response.status}`,
      response.status
    );
  }

  const data = (await response.json()) as { publicToken: string };
  return data.publicToken;
}
