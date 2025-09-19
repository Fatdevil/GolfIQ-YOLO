import axios from "axios";

const API = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const API_KEY = import.meta.env.VITE_API_KEY || "";
const headers = (extra: any = {}) =>
  API_KEY ? { "x-api-key": API_KEY, ...extra } : extra;

export const postMockAnalyze = (body: unknown) =>
  axios
    .post(
      `${API}/cv/mock/analyze`,
      body,
      { headers: headers({ "Content-Type": "application/json" }) }
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
      { headers: headers({ "Content-Type": "multipart/form-data" }) }
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
      { headers: headers({ "Content-Type": "multipart/form-data" }) }
    )
    .then((r) => r.data);

export const listRuns = () =>
  axios.get(`${API}/runs`, { headers: headers() }).then((r) => r.data);
export const getRun = (id: string) =>
  axios.get(`${API}/runs/${id}`, { headers: headers() }).then((r) => r.data);
export const deleteRun = (id: string) =>
  axios.delete(`${API}/runs/${id}`, { headers: headers() }).then((r) => r.data);
