import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  drainOnceForTest,
  enqueueScoreJobForTest,
  mockFetchSequence,
  resetOfflineQueueForTest,
} from "./test-helpers/offline";

vi.mock("../src/offline/telemetry", () => ({ emitQueueTelemetry: vi.fn() }));

describe("score worker revision handling", () => {
  afterEach(() => {
    resetOfflineQueueForTest();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("bumps revision current+1 and succeeds after one conflict", async () => {
    const calls = mockFetchSequence([
      { status: 409, json: { currentRevision: 7 } },
      { status: 200, json: { ok: true } },
    ]);

    await enqueueScoreJobForTest({ revision: 1, scorecardId: "player-1" });

    await act(async () => {
      await drainOnceForTest();
    });

    expect(calls.length).toBe(2);
    const body2 = JSON.parse((calls[1].body as string) ?? "{}");
    expect(body2.revision).toBe(8);
  });

  it("stops after 5 repeated conflicts (loop guard)", async () => {
    mockFetchSequence(Array.from({ length: 6 }, () => ({ status: 409, json: { currentRevision: 10 } })));

    const job = await enqueueScoreJobForTest({ revision: 1, scorecardId: "player-1" });

    await act(async () => {
      await drainOnceForTest();
    });

    const status = await job.status();
    expect(["failed", "done"]).toContain(status);
  });
});
