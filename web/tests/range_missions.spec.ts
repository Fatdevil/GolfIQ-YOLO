import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RANGE_MISSIONS,
  computeMissionProgress,
  loadSelectedMissionId,
  saveSelectedMissionId,
  clearSelectedMissionId,
  getMissionById,
  type RangeMission,
} from "../src/features/range/missions";
import type { RangeShot } from "../src/range/types";

describe("range missions math", () => {
  beforeEach(() => {
    const memoryStorage = createMemoryStorage();
    vi.stubGlobal("window", {
      localStorage: memoryStorage,
    } as unknown as Window & typeof globalThis);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("counts hits inside driver mission band", () => {
    const mission = getMission("driver_fairway_challenge");
    const shots = createShots([205, 220, 180, 240]);

    const progress = computeMissionProgress(mission, shots);

    expect(progress.hitsInBands).toBe(2);
    expect(progress.attempts).toBe(4);
    expect(progress.successRatio).toBeGreaterThan(0);
  });

  it("evaluates multiple target bands for wedge ladder", () => {
    const mission = getMission("wedge_ladder_60_100");
    const shots = createShots([60, 82, 130]);

    const progress = computeMissionProgress(mission, shots);

    expect(progress.hitsInBands).toBe(2);
    expect(progress.attempts).toBe(3);
    expect(progress.success).toBe(true);
  });

  it("treats empty shotlists as zero progress", () => {
    const mission = getMission("approach_band_80_130");
    const progress = computeMissionProgress(mission, []);

    expect(progress.hitsInBands).toBe(0);
    expect(progress.successRatio).toBe(0);
    expect(progress.success).toBe(false);
  });

  it("persists selected mission id", () => {
    expect(loadSelectedMissionId()).toBeNull();

    saveSelectedMissionId("wedge_ladder_60_100");
    expect(loadSelectedMissionId()).toBe("wedge_ladder_60_100");

    clearSelectedMissionId();
    expect(loadSelectedMissionId()).toBeNull();
  });
});

function getMission(id: (typeof RANGE_MISSIONS)[number]["id"]): RangeMission {
  const mission = getMissionById(id);
  if (!mission) {
    throw new Error(`Mission ${id} not found`);
  }
  return mission;
}

function createShots(carries: number[]): RangeShot[] {
  return carries.map((carry, index) => ({
    id: `shot-${index + 1}`,
    ts: Date.now() + index,
    club: "Test club",
    metrics: {
      ballSpeedMps: null,
      ballSpeedMph: null,
      carryM: carry,
      launchDeg: null,
      sideAngleDeg: null,
      quality: "medium",
    },
  }));
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  } satisfies Storage;
}
