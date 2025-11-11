import { afterEach, describe, expect, it, vi } from "vitest";

import type { Job } from "../src/offline/Queue";
import { createScoreWorker, type ScoreJobPayload } from "../src/offline/scoreWorker";

describe("scoreWorker", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries with same idempotency key", async () => {
    const calls: Array<Record<string, string>> = [];
    const fetchMock = vi.fn(async (_url, init) => {
      calls.push((init?.headers ?? {}) as Record<string, string>);
      if (calls.length === 1) {
        throw new Error("offline");
      }
      return {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ status: "ok" }),
        text: vi.fn().mockResolvedValue(""),
      } as unknown as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const payload: ScoreJobPayload = {
      eventId: "event-1",
      body: { scorecardId: "player-1", hole: 1, gross: 4 },
    };
    const handler = createScoreWorker({ fetchImpl: fetchMock });
    const job: Job = {
      id: "score-job",
      type: "score",
      payload,
      attempt: 1,
      nextAt: Date.now(),
      createdAt: Date.now(),
    };
    const tools = {
      signal: undefined,
      update: async () => {},
    };

    const first = await handler(job, tools);
    expect(first.status).toBe("retry");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    job.attempt = 2;
    const second = await handler(job, tools);
    expect(second.status).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const headerValues = calls.map(
      (headers) => headers["X-Client-Req-Id"] ?? headers["x-client-req-id"],
    );
    expect(headerValues).toEqual(["score-job", "score-job"]);
  });
});

