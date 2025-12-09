import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api", async () => {
  const actual = await vi.importActual<typeof import("@/api")>("@/api");
  return {
    ...actual,
    postTelemetryEvent: vi.fn(),
  };
});

import { postTelemetryEvent } from "@/api";
import { recordPracticeMissionOutcome, clearPracticeHistoryForTests } from "@/practice/practiceMissionHistory";

const telemetry = vi.mocked(postTelemetryEvent);

describe("practice mission outcome telemetry", () => {
  beforeEach(() => {
    telemetry.mockReset();
    clearPracticeHistoryForTests();
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    } as unknown as Window & typeof globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("emits mission completion analytics when an outcome is recorded", async () => {
    const now = new Date().toISOString();

    await recordPracticeMissionOutcome({
      missionId: "practice_fill_gap:7i:8i",
      sessionId: "session-1",
      startedAt: now,
      endedAt: now,
      targetClubs: ["7i", "8i"],
      targetSampleCount: 10,
      completedSampleCount: 8,
    });

    expect(telemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "practice_mission_complete",
        missionId: "practice_fill_gap:7i:8i",
        samplesCount: 8,
      }),
    );
  });
});
