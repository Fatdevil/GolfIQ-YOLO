import { describe, expect, it, vi } from "vitest";

import { OfflineQueue, type Job, type JobHandlerResult } from "../src/offline/Queue";

vi.mock("../src/offline/telemetry", () => ({ emitQueueTelemetry: vi.fn() }));

function createQueue(options: { key: string; random?: () => number }) {
  return new OfflineQueue({
    storageKey: options.key,
    random: options.random,
  });
}

describe("OfflineQueue", () => {
  it("drains enqueued jobs and updates state", async () => {
    const queue = createQueue({ key: `queue-${Date.now()}-${Math.random()}` });
    const handler = vi.fn(async () => ({ status: "success" as const } satisfies JobHandlerResult));
    queue.setHandler("score", handler);

    const job: Job = {
      id: "job-1",
      type: "score",
      payload: { hello: "world" },
      attempt: 0,
      nextAt: Date.now(),
      createdAt: Date.now(),
    };

    await queue.enqueue(job);
    expect(await queue.size()).toBe(1);

    await queue.drain();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(await queue.size()).toBe(0);
    expect(queue.getSnapshot().pending).toBe(0);
  });

  it("applies backoff with jitter on retry", async () => {
    const queue = createQueue({ key: "queue-backoff", random: () => 0.5 });
    let attempts = 0;
    queue.setHandler("score", async () => {
      attempts += 1;
      if (attempts === 1) {
        return { status: "retry" };
      }
      return { status: "success" };
    });

    await queue.enqueue({
      id: "retry-job",
      type: "score",
      payload: {},
      attempt: 0,
      nextAt: Date.now(),
      createdAt: Date.now(),
    });

    await queue.drain();

    expect(attempts).toBe(1);
    const snapshot = queue.getSnapshot();
    expect(snapshot.pending).toBe(1);

    const expectedDelay = 2_000 + Math.round(0.5 * 2_000);
    const nextAt = snapshot.nextAttemptAt;
    expect(nextAt).not.toBeNull();
    if (nextAt === null) {
      throw new Error("nextAttemptAt should be scheduled");
    }
    const delta = nextAt - (Date.now() + expectedDelay);
    expect(Math.abs(delta)).toBeLessThan(50);
  });

  it("persists jobs across new instances", async () => {
    const key = `queue-persist-${Date.now()}`;
    const queueA = createQueue({ key });
    await queueA.enqueue({
      id: "persist-job",
      type: "score",
      payload: { foo: "bar" },
      attempt: 0,
      nextAt: Date.now(),
      createdAt: Date.now(),
    });

    const queueB = createQueue({ key });
    const handler = vi.fn().mockResolvedValue({ status: "success" });
    queueB.setHandler("score", async () => handler());

    expect(await queueB.size()).toBe(1);
    await queueB.drain();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(await queueB.size()).toBe(0);
  });
});

