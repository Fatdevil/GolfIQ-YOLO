import { API, withAuth } from "../api";
import type { Job, JobHandler, JobHandlerTools } from "./Queue";

export type ScoreJobPayload = {
  eventId: string;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
};

type ScoreWorkerOptions = {
  apiBase?: string;
  fetchImpl?: typeof fetch;
};

export function createScoreWorker(options: ScoreWorkerOptions = {}): JobHandler {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch implementation is required for score worker");
  }
  const apiBase = options.apiBase ?? API;

  return async (job: Job, tools: JobHandlerTools) => {
    const payload = job.payload as ScoreJobPayload | null;
    if (!payload || typeof payload.eventId !== "string" || typeof payload.body !== "object") {
      return {
        status: "fail",
        error: new Error("Invalid score payload"),
        reason: "invalid-payload",
      };
    }

    try {
      const response = await fetchImpl(`${apiBase}/events/${payload.eventId}/score`, {
        method: "POST",
        headers: {
          ...withAuth({
            "Content-Type": "application/json",
            "X-Client-Req-Id": job.id,
          }),
          ...(payload.headers ?? {}),
        },
        body: JSON.stringify(payload.body ?? {}),
      });

      if (response.ok) {
        return { status: "success" };
      }

      if (response.status === 409 || response.status === 422) {
        const detail = await parseJson(response);
        const nextRevision = readRevision(detail);
        if (nextRevision !== null) {
          await tools.update((current) => {
            const existing = current.payload as ScoreJobPayload;
            const body = { ...(existing.body ?? {}), revision: nextRevision };
            current.payload = { ...existing, body };
            return current;
          });
        }
        const error = new Error(`Score conflict (${response.status})`);
        return { status: "retry", error, reason: `http-${response.status}` };
      }

      if (response.status >= 500 || response.status === 429) {
        const text = await response.text().catch(() => "");
        const message = text || `Score failed (${response.status})`;
        return { status: "retry", error: new Error(message), reason: `http-${response.status}` };
      }

      const detail = await response.text().catch(() => "");
      return {
        status: "fail",
        error: new Error(detail || `Score failed (${response.status})`),
        reason: `http-${response.status}`,
      };
    } catch (error) {
      return { status: "retry", error, reason: "network-error" };
    }
  };
}

async function parseJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const data = await response.json();
    if (data && typeof data === "object") {
      return data as Record<string, unknown>;
    }
  } catch {
    // ignore parse failure
  }
  return null;
}

function readRevision(detail: Record<string, unknown> | null): number | null {
  if (!detail) {
    return null;
  }
  const value = detail.currentRevision ?? detail.revision ?? null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

