import { API } from "../api";

export type RunKind = "hud" | "round" | "unknown";

export interface FetchRunResult {
  id: string;
  data: unknown;
  kind: RunKind;
}

function parseJsonSafe(text: string): unknown {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn("Failed to parse run payload", error);
    throw new Error("Run payload is not valid JSON");
  }
}

function guessKind(id: string, payload: unknown): RunKind {
  if (Array.isArray(payload)) {
    return "hud";
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record["holes"])) {
      return "round";
    }
  }
  if (id.startsWith("hud")) {
    return "hud";
  }
  if (id.startsWith("round")) {
    return "round";
  }
  return "unknown";
}

export async function fetchRun(
  id: string,
  options: { signal?: AbortSignal } = {},
): Promise<FetchRunResult | null> {
  const { signal } = options;
  const response = await fetch(`${API}/runs/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Unable to load run ${id}`);
  }

  const text = await response.text();
  const data = parseJsonSafe(text);
  return {
    id,
    data,
    kind: guessKind(id, data),
  };
}

export function describeRunKind(kind: RunKind): string {
  switch (kind) {
    case "hud":
      return "HUD session";
    case "round":
      return "Round";
    default:
      return "Run";
  }
}
