import { vi } from "vitest";

import { OfflineQueue, type Job } from "../../src/offline/Queue";
import { createScoreWorker, type ScoreJobPayload } from "../../src/offline/scoreWorker";

type RecordedCalls = Array<RequestInit & { url: string }> & {
  mock?: ReturnType<typeof vi.fn>;
};

type MockSequenceEntry = {
  status: number;
  json?: unknown;
  text?: string;
};

let queue: OfflineQueue | null = null;
let keySeed = 0;
const pendingJobIds = new Set<string>();

function ensureQueue(): OfflineQueue {
  if (!queue) {
    queue = new OfflineQueue({ storageKey: `offline-test-${Date.now()}-${++keySeed}` });
  }
  queue.setHandler("score", createScoreWorker());
  return queue;
}

export function resetOfflineQueueForTest(): void {
  queue = null;
  pendingJobIds.clear();
}

export async function enqueueScoreJobForTest(
  body: Record<string, unknown>,
  options?: { eventId?: string; headers?: Record<string, string> },
): Promise<{
  id: string;
  status: () => Promise<"pending" | "failed" | "done">;
}> {
  const activeQueue = ensureQueue();
  const now = Date.now();
  const payload: ScoreJobPayload = {
    eventId: options?.eventId ?? "event-test",
    body: { ...body },
    headers: options?.headers,
  };
  const job: Job = {
    id: `score-${Math.random().toString(36).slice(2)}`,
    type: "score",
    payload,
    attempt: 0,
    nextAt: now,
    createdAt: now,
    meta: {},
  };
  await activeQueue.enqueue(job);
  pendingJobIds.add(job.id);
  return {
    id: job.id,
    status: async () => {
      const current = await activeQueue.getJob(job.id);
      if (current) {
        return "pending";
      }
      pendingJobIds.delete(job.id);
      const snapshot = activeQueue.getSnapshot();
      if (snapshot.lastErrorJobType === "score" && snapshot.lastError) {
        return "failed";
      }
      return "done";
    },
  };
}

export async function drainOnceForTest(): Promise<void> {
  const activeQueue = ensureQueue();
  while (true) {
    await activeQueue.drain();
    if (!pendingJobIds.size) {
      break;
    }
    let hasPending = false;
    for (const jobId of Array.from(pendingJobIds)) {
      const job = await activeQueue.getJob(jobId);
      if (!job) {
        pendingJobIds.delete(jobId);
        continue;
      }
      const now = Date.now();
      if (job.nextAt > now) {
        await activeQueue.updateJob(jobId, (current) => {
          current.nextAt = now;
          return current;
        });
      }
      hasPending = true;
    }
    if (!hasPending) {
      break;
    }
  }
}

export function mockFetchSequence(sequence: MockSequenceEntry[]): RecordedCalls {
  resetOfflineQueueForTest();
  pendingJobIds.clear();
  const calls: RecordedCalls = [] as RecordedCalls;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const index = calls.length;
    const entry = sequence[index] ?? sequence[sequence.length - 1];
    const requestInit = init ?? {};
    calls.push({ url, ...requestInit });
    const text =
      typeof entry.text === "string"
        ? entry.text
        : entry.json
        ? JSON.stringify(entry.json)
        : "";
    return {
      ok: entry.status >= 200 && entry.status < 300,
      status: entry.status,
      json: async () => entry.json ?? {},
      text: async () => text,
    } as Response;
  });
  calls.mock = fetchMock;
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}
