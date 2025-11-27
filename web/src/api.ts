import axios, { type AxiosInstance, type AxiosRequestHeaders } from "axios";
import { getCurrentUserId } from "@/user/currentUserId";

import type { GrossNetMode, TvFlags } from "@shared/events/types";

const API = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const API_KEY = import.meta.env.VITE_API_KEY || "";

export const getApiKey = () => API_KEY;

/** Return default headers incl. x-api-key if present. */
export const withAuth = (extra: Record<string, string> = {}) => {
  const userId = getCurrentUserId();
  return {
    ...(API_KEY ? { "x-api-key": API_KEY } : {}),
    ...(userId ? { "x-user-id": userId } : {}),
    ...extra,
  };
};

const baseClient: AxiosInstance =
  typeof axios.create === "function"
    ? axios.create({ baseURL: API })
    : (axios as unknown as AxiosInstance);

if (baseClient?.interceptors?.request) {
  baseClient.interceptors.request.use((config) => {
    const mergedHeaders: AxiosRequestHeaders = {
      ...(config.headers ?? {}),
      ...withAuth(),
    } as AxiosRequestHeaders;
    config.headers = mergedHeaders;
    return config;
  });
}

export const apiClient = baseClient;

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const existingHeaders =
    typeof Headers !== "undefined" && options.headers instanceof Headers
      ? Object.fromEntries(options.headers.entries())
      : ((options.headers as Record<string, string>) ?? {});
  const headers = withAuth(existingHeaders);
  return fetch(`${API}${path}`, {
    ...options,
    headers,
  });
}

export { API };

export type BundleIndexItem = {
  courseId: string;
  name: string;
  holes: number;
  version?: number;
  ttlSec?: number;
};

export async function fetchBundleIndex(): Promise<BundleIndexItem[]> {
  const response = await axios.get<BundleIndexItem[]>(`${API}/bundle/index`, {
    headers: withAuth(),
  });
  return response.data;
}

export type HudTip = {
  tipId: string;
  title: string;
  body: string;
  club?: string | null;
  playsLike_m?: number | null;
};

export type HoleHud = {
  hole: number;
  courseId?: string | null;
  par?: number | null;
  toGreen_m?: number | null;
  toFront_m?: number | null;
  toBack_m?: number | null;
  playsLike_m?: number | null;
  caddie_confidence?: number | null;
  caddie_silent?: boolean;
  caddie_silent_reason?: string | null;
  wind_mps?: number | null;
  wind_dir_deg?: number | null;
  temp_c?: number | null;
  elev_delta_m?: number | null;
  activeTip?: HudTip | null;
};

export type HudQuery = {
  memberId: string;
  runId: string;
  courseId?: string;
  hole: number;
  lat?: number;
  lon?: number;
  wind_mps?: number;
  wind_dir_deg?: number;
  temp_c?: number;
  elev_delta_m?: number;
};

export async function getHoleHud(query: HudQuery): Promise<HoleHud> {
  const response = await axios.post<HoleHud>(
    `${API}/api/watch/hud/hole`,
    query,
    { headers: withAuth({ "Content-Type": "application/json" }) },
  );
  return response.data;
}

export type CreateEventBody = {
  name: string;
  emoji?: string;
};

export type CreateEventResponse = {
  id: string;
  code: string;
  joinUrl: string;
  qrSvg: string;
};

export const postCreateEvent = (body: CreateEventBody) =>
  axios
    .post<CreateEventResponse>(`${API}/events`, body, {
      headers: withAuth({ 'Content-Type': 'application/json' }),
    })
    .then((r) => r.data);

export type JoinEventBody = {
  memberId?: string;
  name?: string;
};

export type JoinEventResponse = {
  eventId: string;
};

export const postJoinEvent = (code: string, body: JoinEventBody = {}) =>
  axios
    .post<JoinEventResponse>(`${API}/join/${code}`, body, {
      headers: withAuth({ 'Content-Type': 'application/json' }),
    })
    .then((r) => r.data);

export type SpectatorBoardPlayer = {
  name: string;
  gross: number;
  net?: number | null;
  thru: number;
  hole: number;
  status?: string | null;
};

export type SpectatorBoardResponse = {
  players: SpectatorBoardPlayer[];
  updatedAt: string | null;
  grossNet?: GrossNetMode;
  tvFlags?: TvFlags | null;
  participants?: number;
  spectators?: number;
  qrSvg?: string | null;
};

export const fetchSpectatorBoard = (eventId: string) =>
  axios
    .get<SpectatorBoardResponse>(`${API}/events/${eventId}/board`, {
      headers: withAuth(),
    })
    .then((r) => r.data);

export type HostStateResponse = {
  id: string;
  name: string;
  status: string;
  code: string;
  joinUrl: string;
  grossNet: GrossNetMode;
  tvFlags: TvFlags;
  participants: number;
  spectators: number;
  qrSvg?: string | null;
};

type AdminHeadersOptions = {
  memberId?: string;
  includeJson?: boolean;
};

function withAdminHeaders(options: AdminHeadersOptions = {}): Record<string, string> {
  const headers: Record<string, string> = { "x-event-role": "admin" };
  if (options.memberId) {
    headers["x-event-member"] = options.memberId;
  }
  if (options.includeJson) {
    headers["Content-Type"] = "application/json";
  }
  return withAuth(headers);
}

export { withAdminHeaders };

export const fetchHostState = (eventId: string, memberId?: string) =>
  axios
    .get<HostStateResponse>(`${API}/events/${eventId}/host`, {
      headers: withAdminHeaders({ memberId }),
    })
    .then((r) => r.data);

export const postEventStart = (eventId: string, memberId?: string) =>
  axios
    .post<HostStateResponse>(`${API}/events/${eventId}/start`, null, {
      headers: withAdminHeaders({ memberId }),
    })
    .then((r) => r.data);

export const postEventPause = (eventId: string, memberId?: string) =>
  axios
    .post<HostStateResponse>(`${API}/events/${eventId}/pause`, null, {
      headers: withAdminHeaders({ memberId }),
    })
    .then((r) => r.data);

export const postEventClose = (eventId: string, memberId?: string) =>
  axios
    .post<HostStateResponse>(`${API}/events/${eventId}/close`, null, {
      headers: withAdminHeaders({ memberId }),
    })
    .then((r) => r.data);

export const postEventRegenerateCode = (eventId: string, memberId?: string) =>
  axios
    .post<HostStateResponse>(`${API}/events/${eventId}/code/regenerate`, null, {
      headers: withAdminHeaders({ memberId }),
    })
    .then((r) => r.data);

export type ClipCommentaryResponse = {
  title: string;
  summary: string;
  ttsUrl?: string | null;
};

export const postClipCommentary = (clipId: string, memberId?: string) =>
  axios
    .post<ClipCommentaryResponse>(`${API}/events/clips/${clipId}/commentary`, null, {
      headers: withAdminHeaders({ memberId }),
    })
    .then((r) => r.data);

export type UpdateEventSettingsBody = {
  grossNet?: GrossNetMode;
  tvFlags?: TvFlags;
};

export const patchEventSettings = (
  eventId: string,
  body: UpdateEventSettingsBody,
  memberId?: string,
) =>
  axios
    .patch<HostStateResponse>(`${API}/events/${eventId}/settings`, body, {
      headers: withAdminHeaders({ memberId, includeJson: true }),
    })
    .then((r) => r.data);

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
export const fetchSharedRun = (id: string) =>
  axios.get(`${API}/runs/${id}`, { headers: withAuth() }).then((r) => r.data);
export const deleteRun = (id: string) =>
  axios.delete(`${API}/runs/${id}`, { headers: withAuth() }).then((r) => r.data);

export const fetchBenchSummary = () =>
  axios.get(`${API}/bench/summary`, { headers: withAuth() }).then((r) => r.data);

export type TelemetryAggregate = {
  generatedAt: string;
  sampleSize: number;
  tiers: { tier: string; count: number }[];
  profiles: { model: string; os: string; count: number }[];
  runtimeDistribution: { runtime: string; count: number }[];
  latencyP95: { model: string; os: string; p95: number; samples: number }[];
  configHashes: { hash: string; count: number }[];
};

export const fetchTelemetryAggregate = () =>
  axios
    .get<TelemetryAggregate>(`${API}/tools/telemetry/aggregate`, {
      headers: withAuth(),
    })
    .then((r) => r.data);

export type FeedbackSink = {
  email?: string;
  webhook?: string;
};

export type FeedbackQaSummary = Record<string, unknown> | null;

export type FeedbackItem = {
  id: string;
  timestamp: string;
  category: string;
  message: string;
  device: {
    id: string;
    model: string;
    os: string;
    tier: string;
  };
  tier: string;
  qaSummary?: FeedbackQaSummary;
  sink?: FeedbackSink | null;
};

export type FeedbackResponse = {
  generatedAt: string;
  count: number;
  items: FeedbackItem[];
};

export const fetchFeedback = (limit = 100) =>
  axios
    .get<FeedbackResponse>(`${API}/tools/telemetry/feedback?limit=${limit}`, {
      headers: withAuth(),
      validateStatus: (status) => [200, 404].includes(status),
    })
    .then((response) => {
      if (response.status === 404) {
        return { generatedAt: new Date().toISOString(), count: 0, items: [] } as FeedbackResponse;
      }
      return response.data;
    });

export type PlaysLikeTempAltRemoteConfig = {
  enabled?: boolean;
  betaPerC?: number;
  gammaPer100m?: number;
  caps?: {
    perComponent?: number;
    total?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type PlaysLikeWindRemoteConfig = {
  enabled?: boolean;
  head_per_mps?: number;
  slope_per_m?: number;
  cross_aim_deg_per_mps?: number;
  caps?: {
    perComponent?: number;
    total?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type PlaysLikeRemoteConfig = {
  windModel?: string;
  alphaHead_per_mph?: number;
  alphaTail_per_mph?: number;
  slopeFactor?: number;
  windCap_pctOfD?: number;
  taperStart_mph?: number;
  sidewindDistanceAdjust?: boolean;
  tempAlt?: PlaysLikeTempAltRemoteConfig;
  wind?: PlaysLikeWindRemoteConfig;
  [key: string]: unknown;
};

export type RemoteConfigTier = {
  hudEnabled?: boolean;
  inputSize?: number;
  reducedRate?: boolean;
  playsLikeEnabled?: boolean;
  playsLike?: PlaysLikeRemoteConfig;
  ui?: {
    playsLikeVariant?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type RemoteConfigSnapshot = {
  config: Record<string, RemoteConfigTier>;
  etag: string;
  updatedAt: string;
};

export const getRemoteConfig = (etag?: string) =>
  axios
    .get<RemoteConfigSnapshot>(`${API}/config/remote`, {
      headers: withAuth(etag ? { "If-None-Match": etag } : {}),
      validateStatus: (status) => status === 200 || status === 304,
    })
    .then((response) => {
      if (response.status === 304) {
        return null;
      }
      return response.data;
    });

export const postRemoteConfig = (
  payload: Record<string, RemoteConfigTier>,
  adminToken: string,
) =>
  axios
    .post<RemoteConfigSnapshot>(`${API}/config/remote`, payload, {
      headers: withAuth({
        "Content-Type": "application/json",
        "X-Admin-Token": adminToken,
      }),
    })
    .then((r) => r.data);

export type TelemetryEventPayload = {
  event: string;
  [key: string]: unknown;
};

export const postTelemetryEvent = (payload: TelemetryEventPayload) =>
  axios
    .post(`${API}/telemetry`, payload, {
      headers: withAuth({ "Content-Type": "application/json" }),
    })
    .then((r) => r.data);

export type FieldRunMarker = {
  event: string;
  hole?: number;
  timestamp: string | number;
};

export type FieldRunSummary = {
  runId: string;
  startedAt?: string;
  holes: number;
  recenterCount: number;
  avgFps: number;
  batteryDelta: number;
  markers: FieldRunMarker[];
};

export const fetchFieldRuns = () =>
  axios
    .get<FieldRunSummary[]>(`${API}/tools/telemetry/field-runs`, {
      headers: withAuth(),
      validateStatus: (status) => [200, 404].includes(status),
    })
    .then((response) => {
      if (response.status === 404) {
        return [];
      }
      return response.data ?? [];
    });

/**
 * ----------------------------
 * Coach v1 – provider-backed feedback
 * ----------------------------
 * Server route: POST /coach/feedback
 * Body: { runId?: string, metrics?: CoachFeedbackMetrics }
 * Response: { text: string, provider: string, latency_ms: number }
 */

// Shape for optional "quality" field; keep flexible for future variants
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

// Metrics we already expose from /cv/analyze responses
export type CoachFeedbackMetrics = {
  ballSpeedMps?: number | null;
  clubSpeedMps?: number | null;
  sideAngleDeg?: number | null;
  vertLaunchDeg?: number | null;
  carryEstM?: number | null;
  quality?: CoachFeedbackQuality;
  [key: string]: unknown;
};

export type CoachFeedbackRequest =
  | { runId: string; metrics?: never }
  | { runId?: undefined; metrics: CoachFeedbackMetrics };

// Response payload
export type CoachFeedbackResponse = {
  text: string;
  provider: string;
  latency_ms: number;
};

// API call (prefers runId if present; else send metrics)
export const postCoachFeedback = (req: CoachFeedbackRequest) =>
  axios
    .post<CoachFeedbackResponse>(`${API}/coach/feedback`, req, {
      headers: withAuth({ "Content-Type": "application/json" }),
      validateStatus: (s) => s === 200 || s === 429, // 429 rate-limit is handled by UI
    })
    .then((r) => r.data);
