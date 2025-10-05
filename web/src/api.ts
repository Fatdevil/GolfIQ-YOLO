import axios from "axios";

const API = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const API_KEY = import.meta.env.VITE_API_KEY || "";

/** Return default headers incl. x-api-key if present. */
const withAuth = (extra: Record<string, string> = {}) =>
  (API_KEY ? { "x-api-key": API_KEY, ...extra } : extra);

export { API };

export type CalibrationMeasureBody = {
  p1x: number;
  p1y: number;
  p2x: number;
  p2y: number;
  ref_len_m: number;
  fps: number;
};

export type CalibrationMeasureResponse = {
  meters_per_pixel: number;
  fps: number;
  quality: "ok" | "low_fps" | "blurry" | "ok_warn";
};

export const postCalibrationMeasure = (body: CalibrationMeasureBody) =>
  axios
    .post(`${API}/calibrate/measure`, body, {
      headers: withAuth({ "Content-Type": "application/json" }),
    })
    .then((r) => r.data as CalibrationMeasureResponse);

export const postMockAnalyze = (body: unknown) =>
  axios
    .post(
      `${API}/cv/mock/analyze`,
      body,
      { headers: withAuth({ "Content-Type": "application/json" }) }
    )
    .then((r) => r.data);

export const postZipAnalyze = (
  form: FormData,
  q: {
    fps: number;
    ref_len_m: number;
    ref_len_px: number;
    mode?: string;
    smoothing_window?: number;
    persist?: boolean;
  }
) =>
  axios
    .post(
      `${API}/cv/analyze?fps=${q.fps}&ref_len_m=${q.ref_len_m}&ref_len_px=${q.ref_len_px}&mode=${q.mode || "detector"}&smoothing_window=${q.smoothing_window || 3}&persist=${!!q.persist}`,
      form,
      { headers: withAuth({ "Content-Type": "multipart/form-data" }) }
    )
    .then((r) => r.data);

export const postVideoAnalyze = (
  form: FormData,
  q: {
    fps_fallback: number;
    ref_len_m: number;
    ref_len_px: number;
    smoothing_window?: number;
    persist?: boolean;
  }
) =>
  axios
    .post(
      `${API}/cv/analyze/video?fps_fallback=${q.fps_fallback}&ref_len_m=${q.ref_len_m}&ref_len_px=${q.ref_len_px}&smoothing_window=${q.smoothing_window || 3}&persist=${!!q.persist}`,
      form,
      { headers: withAuth({ "Content-Type": "multipart/form-data" }) }
    )
    .then((r) => r.data);

export const listRuns = () =>
  axios.get(`${API}/runs`, { headers: withAuth() }).then((r) => r.data);
export const getRun = (id: string) =>
  axios.get(`${API}/runs/${id}`, { headers: withAuth() }).then((r) => r.data);
export const deleteRun = (id: string) =>
  axios.delete(`${API}/runs/${id}`, { headers: withAuth() }).then((r) => r.data);

export type CoachFeedbackQuality =
  | string
  | null
  | {
      label?: string;
      level?: string;
      rating?: number;
      summary?: string;
      [key: string]: unknown;
    };

export type CoachFeedbackMetrics = {
  ballSpeedMps: number | null;
  clubSpeedMps: number | null;
  sideAngleDeg: number | null;
  vertLaunchDeg: number | null;
  carryEstM: number | null;
  quality: CoachFeedbackQuality;
};

export type CoachFeedbackRequest = {
  run_id?: string;
  metrics?: CoachFeedbackMetrics;
};

export type CoachFeedbackResponse = {
  text: string;
  provider: string;
  latency_ms: number;
};

export const postCoachFeedback = (body: CoachFeedbackRequest) =>
  axios
    .post(`${API}/coach/feedback`, body, {
      headers: withAuth({ "Content-Type": "application/json" }),
    })
    .then((r) => r.data as CoachFeedbackResponse);
