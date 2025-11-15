import axios from "axios";

import { API, withAuth } from "@/api";

export type CameraFitness = {
  score: number;
  level: "good" | "warning" | "bad";
  reasons: string[];
};

export type RangeAnalyzeRequest = {
  frames: number;
  fps: number;
  ref_len_m?: number;
  ref_len_px?: number;
  mode?: string;
  persist?: boolean;
  run_name?: string | null;
  smoothing_window?: number;
};

export type RangeAnalyzeResponse = {
  ball_speed_mps?: number | null;
  ball_speed_mph?: number | null;
  club_speed_mps?: number | null;
  club_speed_mph?: number | null;
  carry_m?: number | null;
  launch_deg?: number | null;
  side_deg?: number | null;
  quality?: CameraFitness | null;
  impact_quality?: string | null;
  metrics?: {
    ball_speed_mps?: number | null;
    ball_speed_mph?: number | null;
    club_speed_mps?: number | null;
    club_speed_mph?: number | null;
    carry_m?: number | null;
    launch_deg?: number | null;
    side_angle_deg?: number | null;
    quality?: string | null;
    impact_quality?: string | null;
  } | null;
};

export const postRangeAnalyze = (body: RangeAnalyzeRequest) =>
  axios
    .post<RangeAnalyzeResponse>(`${API}/range/practice/analyze`, body, {
      headers: withAuth({ "Content-Type": "application/json" }),
    })
    .then((r) => r.data);
