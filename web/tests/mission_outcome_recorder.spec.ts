import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api", async () => {
  const actual = await vi.importActual<typeof import("@/api")>("@/api");
  return {
    ...actual,
    postTelemetryEvent: vi.fn(),
  };
});

import { postTelemetryEvent } from "@/api";
import {
  recordPracticeMissionOutcome,
  clearPracticeHistoryForTests,
  PRACTICE_MISSION_HISTORY_KEY,
} from "@/practice/practiceMissionHistory";

const telemetry = vi.mocked(postTelemetryEvent);

describe("practice mission outcome telemetry", () => {
  const now = new Date("2024-02-08T12:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    telemetry.mockReset();
    clearPracticeHistoryForTests();
    vi.setSystemTime(now);
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
    vi.useRealTimers();
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
    expect(telemetry).not.toHaveBeenCalledWith(expect.objectContaining({ event: "practice_goal_reached" }));
  });

  it("emits a goal reached event when the weekly target is hit", async () => {
    const existingHistory = [
      {
        id: "e1",
        missionId: "m1",
        startedAt: "2024-02-05T10:00:00Z",
        endedAt: "2024-02-05T10:20:00Z",
        status: "completed",
        targetClubs: ["7i"],
        completedSampleCount: 8,
      },
      {
        id: "e2",
        missionId: "m2",
        startedAt: "2024-02-06T10:00:00Z",
        endedAt: "2024-02-06T10:20:00Z",
        status: "completed",
        targetClubs: ["7i"],
        completedSampleCount: 8,
      },
    ];
    window.localStorage.setItem(PRACTICE_MISSION_HISTORY_KEY, JSON.stringify(existingHistory));

    await recordPracticeMissionOutcome({
      missionId: "practice_fill_gap:7i:8i",
      sessionId: "session-1",
      startedAt: "2024-02-07T10:00:00Z",
      endedAt: "2024-02-07T10:00:00Z",
      targetClubs: ["7i", "8i"],
      targetSampleCount: 10,
      completedSampleCount: 12,
    });

    expect(telemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "practice_goal_reached",
        goalId: "weekly_mission_completions",
        targetCompletions: 3,
        completedInWindow: 3,
        windowDays: 7,
        platform: "web",
        source: "practice_mission",
        streak_weeks: 1,
      }),
    );
  });

  it("does not duplicate goal reached events after the target is satisfied", async () => {
    const existingHistory = [
      {
        id: "e1",
        missionId: "m1",
        startedAt: "2024-02-03T10:00:00Z",
        endedAt: "2024-02-03T10:20:00Z",
        status: "completed",
        targetClubs: ["7i"],
        completedSampleCount: 8,
      },
      {
        id: "e2",
        missionId: "m2",
        startedAt: "2024-02-04T10:00:00Z",
        endedAt: "2024-02-04T10:20:00Z",
        status: "completed",
        targetClubs: ["7i"],
        completedSampleCount: 8,
      },
      {
        id: "e3",
        missionId: "m3",
        startedAt: "2024-02-06T10:00:00Z",
        endedAt: "2024-02-06T10:20:00Z",
        status: "completed",
        targetClubs: ["7i"],
        completedSampleCount: 8,
      },
    ];
    window.localStorage.setItem(PRACTICE_MISSION_HISTORY_KEY, JSON.stringify(existingHistory));

    await recordPracticeMissionOutcome({
      missionId: "practice_fill_gap:7i:8i",
      sessionId: "session-1",
      startedAt: "2024-02-07T10:00:00Z",
      endedAt: "2024-02-07T10:00:00Z",
      targetClubs: ["7i", "8i"],
      targetSampleCount: 10,
      completedSampleCount: 12,
    });

    expect(telemetry).toHaveBeenCalledWith(
      expect.objectContaining({ event: "practice_mission_complete" }),
    );
    expect(telemetry).not.toHaveBeenCalledWith(expect.objectContaining({ event: "practice_goal_reached" }));
  });
});
