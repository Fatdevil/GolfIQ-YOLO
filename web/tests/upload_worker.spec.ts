import { afterEach, describe, expect, it, vi } from "vitest";

import type { Job } from "../src/offline/Queue";
import { createUploadWorker, type UploadJobPayload } from "../src/offline/uploadWorker";

describe("uploadWorker", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries on 5xx before succeeding", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ url: "https://upload.test", fields: { key: "run.zip" } }))
      .mockResolvedValueOnce(createResponse(500))
      .mockResolvedValueOnce(createResponse(200))
      .mockResolvedValueOnce(createJsonResponse({ ok: true }));

    const handler = createUploadWorker({ fetchImpl: fetchMock });
    const payload: UploadJobPayload = {
      runId: "run-1",
      file: new Blob(["hello"], { type: "application/zip" }),
      finalize: { url: "https://api.test/runs/finalize" },
    };
    const state = createJobState({ id: "job-upload", payload, attempt: 1 });

    const first = await handler(state.job, state.tools);
    expect(first.status).toBe("retry");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    state.job = { ...state.job, attempt: 2 };
    const second = await handler(state.job, state.tools);
    expect(second.status).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const finalizeCall = fetchMock.mock.calls.at(-1);
    expect(finalizeCall?.[0]).toBe("https://api.test/runs/finalize");
    expect(JSON.parse(finalizeCall?.[1]?.body as string)).toMatchObject({ runId: "run-1", key: "run.zip" });
  });

  it("re-presigns when upload URL expires", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ url: "https://upload.one", fields: { key: "clip-1" } }))
      .mockResolvedValueOnce(createResponse(403))
      .mockResolvedValueOnce(createJsonResponse({ url: "https://upload.two", fields: { key: "clip-1" } }))
      .mockResolvedValueOnce(createResponse(200))
      .mockResolvedValueOnce(createJsonResponse({ ok: true }));

    const handler = createUploadWorker({ fetchImpl: fetchMock });
    const payload: UploadJobPayload = {
      runId: "run-expired",
      file: new Blob(["payload"], { type: "application/zip" }),
      finalize: { url: "https://api.test/runs/finalize" },
    };
    const state = createJobState({ id: "job-expired", payload, attempt: 1 });

    const first = await handler(state.job, state.tools);
    expect(first.status).toBe("retry");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    state.job = { ...state.job, attempt: 2 };
    const second = await handler(state.job, state.tools);
    expect(second.status).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const uploadCall = fetchMock.mock.calls[3];
    expect(uploadCall?.[0]).toBe("https://upload.two");
  });
});

function createJobState(options: { id: string; payload: UploadJobPayload; attempt: number }) {
  const state: { current: Job } = {
    current: {
      id: options.id,
      type: "upload",
      payload: options.payload,
      attempt: options.attempt,
      nextAt: Date.now(),
      createdAt: Date.now(),
    },
  };
  const tools = {
    signal: undefined,
    update: async (updater: Job | ((job: Job) => Job | void)) => {
      if (typeof updater === "function") {
        const result = updater({ ...state.current });
        if (result) {
          state.current = { ...result };
        }
      } else if (updater) {
        state.current = { ...updater };
      }
    },
  };
  return {
    get job() {
      return state.current;
    },
    set job(next: Job) {
      state.current = next;
    },
    tools,
  };
}

function createResponse(status: number, body?: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(body ?? ""),
  } as unknown as Response;
}

function createJsonResponse(data: Record<string, unknown>): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  } as unknown as Response;
}

