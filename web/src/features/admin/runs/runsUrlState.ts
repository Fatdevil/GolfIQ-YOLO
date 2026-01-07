import type { RunStatusV1 } from "@/api/runsV1";

export type RunsSortKey = "created" | "duration" | "status";
export type RunsSortDirection = "asc" | "desc";

export type RunsUrlState = {
  q: string;
  status: RunStatusV1 | "";
  sort: RunsSortKey;
  dir: RunsSortDirection;
  runId: string | null;
};

export const DEFAULT_RUNS_URL_STATE: RunsUrlState = {
  q: "",
  status: "",
  sort: "created",
  dir: "desc",
  runId: null,
};

const SORT_KEYS: RunsSortKey[] = ["created", "duration", "status"];
const DIRECTIONS: RunsSortDirection[] = ["asc", "desc"];
const STATUSES: Array<RunStatusV1> = ["processing", "succeeded", "failed"];

const parseSort = (value: string | null): RunsSortKey => {
  if (value && SORT_KEYS.includes(value as RunsSortKey)) {
    return value as RunsSortKey;
  }
  return DEFAULT_RUNS_URL_STATE.sort;
};

const parseDir = (value: string | null): RunsSortDirection => {
  if (value && DIRECTIONS.includes(value as RunsSortDirection)) {
    return value as RunsSortDirection;
  }
  return DEFAULT_RUNS_URL_STATE.dir;
};

const parseStatus = (value: string | null): RunStatusV1 | "" => {
  if (value && STATUSES.includes(value as RunStatusV1)) {
    return value as RunStatusV1;
  }
  return DEFAULT_RUNS_URL_STATE.status;
};

export function parseRunsQuery(search: URLSearchParams | string | null | undefined): RunsUrlState {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search ?? new URLSearchParams();

  const q = params.get("q") ?? DEFAULT_RUNS_URL_STATE.q;
  const status = parseStatus(params.get("status"));
  const sort = parseSort(params.get("sort"));
  const dir = parseDir(params.get("dir"));
  const runId = params.get("runId");

  return {
    q,
    status,
    sort,
    dir,
    runId: runId ?? null,
  };
}

export function buildRunsQuery(state: Partial<RunsUrlState>): string {
  const merged: RunsUrlState = {
    ...DEFAULT_RUNS_URL_STATE,
    ...state,
  } as RunsUrlState;

  const params = new URLSearchParams();

  if (merged.q.trim()) params.set("q", merged.q.trim());
  if (merged.status) params.set("status", merged.status);
  if (merged.sort !== DEFAULT_RUNS_URL_STATE.sort) params.set("sort", merged.sort);
  if (merged.dir !== DEFAULT_RUNS_URL_STATE.dir) params.set("dir", merged.dir);
  if (merged.runId) params.set("runId", merged.runId);

  const query = params.toString();
  return query.length ? `?${query}` : "";
}
