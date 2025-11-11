import { API, withAuth } from "../api";
import { uploadPresignVersion, uploadRetryMaxMs } from "../config";
import type { Job, JobHandler, JobHandlerTools } from "./Queue";

type PresignFields = {
  key?: string;
  contentType?: string;
  [key: string]: string | undefined;
};

type PresignState = {
  url: string;
  fields: PresignFields;
  obtainedAt: number;
  expiresAt?: number | null;
};

export type UploadJobPayload = {
  runId: string;
  file: Blob;
  contentType?: string;
  metadata?: Record<string, unknown> | null;
  finalize?: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: Record<string, unknown> | null;
  } | null;
  presign?: PresignState | null;
};

type UploadWorkerOptions = {
  apiBase?: string;
  fetchImpl?: typeof fetch;
  presignVersion?: string;
  maxRetryMs?: number;
};

const DEFAULT_EXPIRED_RETRY_MS = 1_000;

export function createUploadWorker(options: UploadWorkerOptions = {}): JobHandler {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch implementation is required for upload worker");
  }
  const apiBase = options.apiBase ?? API;
  const presignVersion = options.presignVersion ?? uploadPresignVersion;
  const retryCap = Math.max(0, options.maxRetryMs ?? uploadRetryMaxMs);

  return async (job: Job, tools: JobHandlerTools) => {
    const payload = job.payload as UploadJobPayload | null;
    if (!payload || typeof payload.runId !== "string" || !(payload.file instanceof Blob)) {
      return {
        status: "fail",
        error: new Error("Invalid upload payload"),
        reason: "invalid-payload",
      };
    }

    try {
      let presign = payload.presign ?? null;
      if (!presign || isPresignExpired(presign)) {
        presign = await requestPresign(fetchImpl, apiBase, presignVersion, payload.runId);
        await tools.update((current) => {
          const nextPayload = { ...(current.payload as UploadJobPayload), presign };
          current.payload = nextPayload;
          return current;
        });
      }

      const uploadResult = await performUpload(fetchImpl, presign, payload);
      if (!uploadResult.ok) {
        if (uploadResult.status === 403) {
          await tools.update((current) => {
            const nextPayload = { ...(current.payload as UploadJobPayload), presign: null };
            current.payload = nextPayload;
            return current;
          });
          return {
            status: "retry",
            delayMs: Math.min(DEFAULT_EXPIRED_RETRY_MS, retryCap || DEFAULT_EXPIRED_RETRY_MS),
            error: new Error("Upload URL expired"),
            reason: "presign-expired",
          };
        }
        if (uploadResult.status >= 500 || uploadResult.status === 429) {
          const message = await readBody(uploadResult);
          return {
            status: "retry",
            error: new Error(message || `Upload failed (${uploadResult.status})`),
            reason: `http-${uploadResult.status}`,
          };
        }
        const detail = await readBody(uploadResult);
        return {
          status: "fail",
          error: new Error(detail || `Upload failed (${uploadResult.status})`),
          reason: `http-${uploadResult.status}`,
        };
      }

      const finalizeRequest = payload.finalize;
      if (finalizeRequest && finalizeRequest.url) {
        const response = await performFinalize(
          fetchImpl,
          finalizeRequest,
          payload,
          presign.fields,
        );
        if (!response.ok) {
          if (response.status >= 500 || response.status === 429) {
            const message = await readBody(response);
            return {
              status: "retry",
              error: new Error(message || `Finalize failed (${response.status})`),
              reason: `http-${response.status}`,
            };
          }
          const detail = await readBody(response);
          return {
            status: "fail",
            error: new Error(detail || `Finalize failed (${response.status})`),
            reason: `http-${response.status}`,
          };
        }
      }

      return { status: "success" };
    } catch (error) {
      return {
        status: "retry",
        error,
        reason: "network-error",
      };
    }
  };
}

function isPresignExpired(state: PresignState): boolean {
  if (typeof state.expiresAt === "number") {
    return Date.now() >= state.expiresAt;
  }
  return false;
}

async function requestPresign(
  fetchImpl: typeof fetch,
  apiBase: string,
  version: string,
  runId: string,
): Promise<PresignState> {
  const response = await fetchImpl(`${apiBase}/runs/upload-url?version=${encodeURIComponent(version)}`, {
    method: "POST",
    headers: {
      ...withAuth({ "Content-Type": "application/json" }),
    },
    body: JSON.stringify({ runId }),
  });
  if (!response.ok) {
    const detail = await readBody(response);
    throw new Error(detail || `Presign failed (${response.status})`);
  }
  const data = await response.json().catch(() => ({}));
  const url = typeof data?.url === "string" ? data.url : "";
  if (!url) {
    throw new Error("Presign payload missing url");
  }
  const fieldsRaw = (data?.fields ?? {}) as Record<string, unknown>;
  const fields: PresignFields = {};
  for (const [key, value] of Object.entries(fieldsRaw)) {
    if (typeof value === "string") {
      fields[key] = value;
    }
  }
  const expiresAt = parseExpiry(data?.expiresAt);
  return {
    url,
    fields,
    obtainedAt: Date.now(),
    expiresAt,
  };
}

async function performUpload(
  fetchImpl: typeof fetch,
  presign: PresignState,
  payload: UploadJobPayload,
) {
  const headers: Record<string, string> = {};
  const contentType = payload.contentType || presign.fields.contentType;
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  for (const [key, value] of Object.entries(presign.fields)) {
    if (value && key.toLowerCase().startsWith("x-amz-")) {
      headers[key] = value;
    }
  }
  return fetchImpl(presign.url, {
    method: "PUT",
    headers,
    body: payload.file,
  });
}

async function performFinalize(
  fetchImpl: typeof fetch,
  finalize: NonNullable<UploadJobPayload["finalize"]>,
  payload: UploadJobPayload,
  fields: PresignFields,
) {
  const method = finalize.method ?? "POST";
  const headers = {
    ...withAuth({ "Content-Type": "application/json" }),
    ...(finalize.headers ?? {}),
  };
  const body: Record<string, unknown> = {
    runId: payload.runId,
    key: fields.key ?? null,
    ...(payload.metadata ?? {}),
    ...(finalize.body ?? {}),
  };
  return fetchImpl(finalize.url, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

async function readBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.trim();
  } catch {
    return "";
  }
}

function parseExpiry(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

