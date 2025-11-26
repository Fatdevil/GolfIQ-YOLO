import axios from "axios";

import { API, withAuth } from "@/api";

export type HoleDetectRequest = {
  courseId: string;
  lat: number;
  lon: number;
  lastHole?: number | null;
};

export type HoleDetectResponse = {
  hole: number;
  distance_m: number;
  confidence: number;
  reason: string;
};

export async function detectHole(
  body: HoleDetectRequest,
): Promise<HoleDetectResponse> {
  const resp = await axios.post<HoleDetectResponse>(`${API}/api/hole/detect`, body, {
    headers: withAuth({ "Content-Type": "application/json" }),
  });

  return resp.data;
}
