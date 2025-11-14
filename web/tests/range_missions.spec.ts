import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RANGE_MISSIONS,
  computeMissionProgress,
  grooveFillPercent,
  loadSelectedMissionId,
  saveSelectedMissionId,
  clearSelectedMissionId,
  getMissionById,
  type Mission,
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

  it("counts fairway finder reps within tolerance", () => {
    const mission = getMission("fairway-finder");
    const shots = createShots([200, 210, 220, 250]);

    const progress = computeMissionProgress(mission, shots);

    expect(progress.goodReps).toBe(3);
    expect(progress.totalShots).toBe(4);
  });

  it("uses session mean for stock yardage mission", () => {
    const mission = getMission("stock-yardage");
    const shots = createShots([150, 152, 148, 149, 151, 150, 147, 153]);

    const progress = computeMissionProgress(mission, shots);

    expect(progress.goodReps).toBeGreaterThan(0);
    expect(progress.goodReps).toBe(progress.totalShots);
  });

  it("clamps groove fill percent between 0 and 100", () => {
    const mission = getMission("fairway-finder");

    expect(grooveFillPercent(mission, { missionId: mission.id, goodReps: 0, totalShots: 0 })).toBe(0);
    expect(
      grooveFillPercent(mission, { missionId: mission.id, goodReps: 5, totalShots: 5 })
    ).toBe(50);
    expect(
      grooveFillPercent(mission, { missionId: mission.id, goodReps: 20, totalShots: 20 })
    ).toBe(100);
  });

  it("persists selected mission id", () => {
    expect(loadSelectedMissionId()).toBeNull();

    saveSelectedMissionId("wedge-ladder");
    expect(loadSelectedMissionId()).toBe("wedge-ladder");

    clearSelectedMissionId();
    expect(loadSelectedMissionId()).toBeNull();
  });
});

function getMission(id: (typeof RANGE_MISSIONS)[number]["id"]): Mission {
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
