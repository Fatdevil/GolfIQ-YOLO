import { API, withAuth } from "../api";
import type { Job, JobHandler, JobHandlerTools } from "./Queue";

export type ScoreJobPayload = {
  eventId: string;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
  revision?: number;
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
        body: JSON.stringify(prepareRequestBody(payload)),
      });

      if (response.ok) {
        return { status: "success" };
      }

      if (response.status === 409 || response.status === 422) {
        const detail = await parseJson(response);
        const currentRevision = readCurrentRevision(detail);
        const previousAttempts = readRevisionAttempts(job.meta);
        const attempts = previousAttempts + 1;

        if (attempts > 5) {
          await tools.update((currentJob) => {
            currentJob.meta = { ...(isRecord(currentJob.meta) ? currentJob.meta : {}), revAttempts: attempts };
            return currentJob;
          });
          const error = new Error("revision conflict persisted");
          (error as ErrorWithCode).code = "REVISION_CONFLICT_MAX";
          (error as ErrorWithCode).current = currentRevision;
          return { status: "fail", error, reason: "revision-conflict-max" };
        }

        await tools.update((currentJob) => {
          const existing = currentJob.payload as ScoreJobPayload;
          const previousRevision = readPayloadRevision(existing);
          const nextRevisionCandidate =
            typeof currentRevision === "number" ? currentRevision + 1 : (previousRevision ?? 0) + 1;
          const revision = Math.max(nextRevisionCandidate, (previousRevision ?? 0) + 1);
          const nextBody = { ...(existing.body ?? {}), revision };
          currentJob.payload = { ...existing, body: nextBody, revision };
          currentJob.meta = { ...(isRecord(currentJob.meta) ? currentJob.meta : {}), revAttempts: attempts };
          return currentJob;
        });

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

function readCurrentRevision(detail: unknown): number | null {
  try {
    if (detail && typeof detail === "object") {
      const d = detail as Record<string, unknown>;
      const direct = d.currentRevision;
      if (typeof direct === "number" && Number.isFinite(direct)) {
        return direct;
      }
      const nested = d.current;
      if (nested && typeof nested === "object") {
        const revision = (nested as Record<string, unknown>).revision;
        if (typeof revision === "number" && Number.isFinite(revision)) {
          return revision;
        }
      }
    }
  } catch {
    // ignore malformed detail
  }
  return null;
}

function prepareRequestBody(payload: ScoreJobPayload): Record<string, unknown> {
  const body = { ...(payload.body ?? {}) };
  const revision = readPayloadRevision(payload);
  if (typeof revision === "number") {
    body.revision = revision;
  }
  return body;
}

function readPayloadRevision(payload: ScoreJobPayload): number | null {
  if (typeof payload.revision === "number" && Number.isFinite(payload.revision)) {
    return payload.revision;
  }
  const bodyRevision = payload.body?.revision;
  if (typeof bodyRevision === "number" && Number.isFinite(bodyRevision)) {
    return bodyRevision;
  }
  return null;
}

function readRevisionAttempts(meta: unknown): number {
  if (!isRecord(meta)) {
    return 0;
  }
  const value = meta.revAttempts;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

type ErrorWithCode = Error & { code?: string; current?: number | null };

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

