import { API } from "../api";

type HudPayload = {
  kind: "hud";
  id: string;
  events: unknown[];
  rawText: string;
};

type RoundPayload = {
  kind: "round";
  id: string;
  record: Record<string, unknown>;
  rawText: string;
};

export type FetchRunResult = HudPayload | RoundPayload;

function detectKind(id: string, payload: unknown, rawText: string): FetchRunResult {
  if (Array.isArray(payload)) {
    return { kind: "hud", id, events: payload, rawText };
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record["events"])) {
      return {
        kind: "hud",
        id,
        events: record["events"] as unknown[],
        rawText,
      };
    }
    return { kind: "round", id, record, rawText };
  }
  throw new Error("Unsupported run payload");
}

export async function fetchRun(id: string): Promise<FetchRunResult | null> {
  const url = `${API}/runs/${encodeURIComponent(id)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch run (${response.status})`);
  }

  const rawText = await response.text();
  if (!rawText.trim()) {
    throw new Error("Run payload was empty");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new Error("Run payload was not valid JSON");
  }

  return detectKind(id, parsed, rawText);
}
