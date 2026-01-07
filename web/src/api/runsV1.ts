import type { AxiosError } from "axios";
import { API, apiClient, withAuth } from "@/api";

export type RunStatusV1 = "processing" | "succeeded" | "failed";
export type RunKindV1 = "image" | "video" | "range";
export type RunsSortKeyV1 = "created" | "duration" | "status";
export type RunsSortDirectionV1 = "asc" | "desc";

export type RunsListFilters = {
  q?: string;
  status?: RunStatusV1 | "";
  sort?: RunsSortKeyV1;
  dir?: RunsSortDirectionV1;
  kind?: RunKindV1 | string;
  modelVariant?: string;
  createdAfter?: string;
  createdBefore?: string;
  cursor?: string | null;
  limit?: number;
};

export type RunsErrorPayload = {
  run_id?: string;
  error_code?: string;
  message?: string;
};

export type RunsError = {
  runId?: string;
  errorCode?: string;
  message: string;
  status?: number;
};

export type RunListItem = {
  run_id: string;
  status: RunStatusV1;
  source: string;
  source_type: string;
  created_at: string;
  updated_at: string;
  model_variant_selected?: string | null;
  override_source: string;
  inference_timing?: Record<string, unknown> | null;
  kind?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  input_ref?: Record<string, unknown> | null;
  timings?: Record<string, unknown> | null;
  started_at?: string | null;
  finished_at?: string | null;
};

export type RunListResponse = {
  items: RunListItem[];
  next_cursor?: string | null;
  prev_cursor?: string | null;
};

export type RunArtifactLink = {
  label?: string;
  url?: string;
  key?: string;
  kind?: string;
};

export type RunMediaLinks = {
  video_url?: string;
  overlay_url?: string;
  telemetry_url?: string;
  [key: string]: string | undefined;
};

export type RunDetailV1 = RunListItem & {
  created_ts: number;
  updated_ts: number;
  started_ts?: number | null;
  finished_ts?: number | null;
  params: Record<string, unknown>;
  metrics: Record<string, unknown>;
  events: number[];
  model_variant_requested?: string | null;
  metadata: Record<string, unknown>;
  impact_preview?: string | null;
  inputs?: Record<string, unknown> | null;
  artifacts?: RunArtifactLink[];
  media?: RunMediaLinks;
  diagnostics?: Record<string, unknown> | null;
  raw_payload?: Record<string, unknown> | null;
};

export type RunDetail = RunDetailV1;

export type RunPruneRequest = {
  max_runs?: number;
  max_age_days?: number;
};

export type RunPruneResponse = {
  scanned: number;
  deleted: number;
  kept: number;
};

const toIso = (value?: string): string | undefined => {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

export function buildRunsListQuery(params: RunsListFilters = {}): Record<string, unknown> {
  const query: Record<string, unknown> = {
    limit: params.limit ?? 50,
  };

  if (params.q?.trim()) query.q = params.q.trim();
  if (params.status) query.status = params.status;
  if (params.sort) query.sort = params.sort;
  if (params.dir) query.dir = params.dir;
  if (params.kind) query.kind = params.kind;
  if (params.modelVariant) query.model_variant = params.modelVariant;
  if (params.cursor) query.cursor = params.cursor;

  const createdAfter = toIso(params.createdAfter);
  const createdBefore = toIso(params.createdBefore);
  if (createdAfter) query.created_after = createdAfter;
  if (createdBefore) query.created_before = createdBefore;

  return query;
}

export function resolveRunsError(error: unknown, fallback = "Failed to load runs"): RunsError {
  const axiosError = error as AxiosError<RunsErrorPayload>;
  const payload = axiosError?.response?.data;
  return {
    runId: payload?.run_id,
    errorCode: payload?.error_code,
    message: payload?.message || axiosError?.message || fallback,
    status: axiosError?.response?.status,
  };
}

export async function listRunsV1(params: RunsListFilters = {}): Promise<RunListResponse> {
  const response = await apiClient.get<RunListResponse>("/runs/v1", {
    params: buildRunsListQuery(params),
    headers: withAuth(),
  });
  return response.data;
}

export async function getRunDetailV1(runId: string, headers: Record<string, string> = {}): Promise<RunDetailV1> {
  try {
    const response = await apiClient.get<RunDetailV1>(`/runs/v1/${encodeURIComponent(runId)}`, {
      headers: withAuth(headers),
    });
    return response.data;
  } catch (error) {
    throw resolveRunsError(error, "Failed to load run detail");
  }
}

export async function pruneRunsV1(payload?: RunPruneRequest): Promise<RunPruneResponse> {
  const response = await apiClient.post<RunPruneResponse>("/runs/v1/prune", payload ?? {}, {
    headers: withAuth({ "Content-Type": "application/json" }),
  });
  return response.data;
}

export function buildRunDetailCurl(runId: string): string {
  const headers = withAuth({ Accept: "application/json", "Content-Type": "application/json" });
  const headerFlags = Object.entries(headers)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `-H "${key}: ${value}"`)
    .join(" ");
  const url = `${API}/runs/v1/${encodeURIComponent(runId)}`;
  return `curl -X GET "${url}" ${headerFlags}`.trim();
}
