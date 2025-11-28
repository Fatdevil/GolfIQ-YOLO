import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendRangeSession,
  computeBasicStats,
  getCoachTag,
  loadRangeSessions,
  type RangeSession,
} from "@/features/range/sessions";
import type { RangeShot } from "@/range/types";

const makeShot = (carry: number): RangeShot => ({
  id: `shot-${carry}`,
  ts: Date.now(),
  club: "7i",
  metrics: {
    ballSpeedMps: null,
    ballSpeedMph: null,
    carryM: carry,
    launchDeg: null,
    sideAngleDeg: null,
    quality: "good",
  },
});

describe("computeBasicStats", () => {
  it("returns null stats when no carries are available", () => {
    const result = computeBasicStats([]);
    expect(result.shotCount).toBe(0);
    expect(result.avgCarry_m).toBeNull();
    expect(result.carryStd_m).toBeNull();
  });

  it("calculates mean and std deviation for carries", () => {
    const shots = [makeShot(100), makeShot(110), makeShot(120)];

    const result = computeBasicStats(shots);

    expect(result.shotCount).toBe(3);
    expect(result.avgCarry_m).toBeCloseTo(110, 6);
    expect(result.carryStd_m).toBeCloseTo(8.1649658, 5);
  });
});

describe("range session storage", () => {
  beforeEach(() => {
    let store: Record<string, string> = {};
    const localStorageMock = {
      getItem: vi.fn((key: string) => (key in store ? store[key] : null)),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
      key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
      get length() {
        return Object.keys(store).length;
      },
    } satisfies Partial<Storage>;

    vi.stubGlobal(
      "window",
      {
        localStorage: localStorageMock as Storage,
      } as unknown as Window & typeof globalThis
    );

    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("appends sessions and loads them sorted by newest first", () => {
    const older: RangeSession = {
      id: "session-1",
      startedAt: "2024-01-01T10:00:00.000Z",
      endedAt: "2024-01-01T11:00:00.000Z",
      shotCount: 10,
      avgCarry_m: null,
      carryStd_m: null,
    };

    const newer: RangeSession = {
      id: "session-2",
      startedAt: "2024-02-01T10:00:00.000Z",
      endedAt: "2024-02-01T11:00:00.000Z",
      shotCount: 12,
      avgCarry_m: null,
      carryStd_m: null,
    };

    appendRangeSession(older);
    appendRangeSession(newer);

    const sessions = loadRangeSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe("session-2");
    expect(sessions[1].id).toBe("session-1");
  });

  it("caps the stored sessions at 50 entries", () => {
    for (let i = 0; i < 55; i += 1) {
      appendRangeSession({
        id: `session-${i}`,
        startedAt: new Date(2024, 0, i + 1).toISOString(),
        endedAt: new Date(2024, 0, i + 1, 1).toISOString(),
        shotCount: 5,
        avgCarry_m: null,
        carryStd_m: null,
      });
    }

    const sessions = loadRangeSessions();
    expect(sessions).toHaveLength(50);
    expect(sessions[0].id).toBe("session-54");
    expect(sessions.at(-1)?.id).toBe("session-5");
  });
});

describe("getCoachTag", () => {
  const baseSession: RangeSession = {
    id: "session-base",
    startedAt: "2024-01-01T10:00:00.000Z",
    endedAt: "2024-01-01T11:00:00.000Z",
    shotCount: 10,
    avgCarry_m: null,
    carryStd_m: null,
  };

  it("returns too_few_shots when not enough swings recorded", () => {
    expect(getCoachTag({ ...baseSession, shotCount: 3 })).toBe("too_few_shots");
  });

  it("returns mission_completed when target reps achieved", () => {
    expect(
      getCoachTag({
        ...baseSession,
        missionId: "wedge_ladder_60_100",
        missionGoodReps: 10,
        missionTargetReps: 10,
      })
    ).toBe("mission_completed");
  });

  it("returns mission_progress when halfway to target reps", () => {
    expect(
      getCoachTag({
        ...baseSession,
        missionId: "wedge_ladder_60_100",
        missionGoodReps: 5,
        missionTargetReps: 10,
      })
    ).toBe("mission_progress");
  });

  it("returns very_consistent_distance when carry std dev is low", () => {
    expect(getCoachTag({ ...baseSession, carryStd_m: 6 })).toBe(
      "very_consistent_distance"
    );
  });

  it("returns high_hit_rate when hit rate is strong", () => {
    expect(getCoachTag({ ...baseSession, hitRate_pct: 75 })).toBe("high_hit_rate");
  });

  it("falls back to mixed_results otherwise", () => {
    expect(getCoachTag(baseSession)).toBe("mixed_results");
  });
});
