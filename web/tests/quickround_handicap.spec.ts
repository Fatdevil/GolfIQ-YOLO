import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearDefaultHandicap,
  loadDefaultHandicap,
  saveDefaultHandicap,
} from "../src/features/quickround/storage";
import { computeQuickRoundSummary } from "../src/features/quickround/summary";
import type { QuickRound } from "../src/features/quickround/types";

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

describe("quick round handicap helpers", () => {
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

  it("stores and reads default handicap", () => {
    expect(loadDefaultHandicap()).toBeNull();

    saveDefaultHandicap(14.2);
    expect(loadDefaultHandicap()).toBe(14.2);

    clearDefaultHandicap();
    expect(loadDefaultHandicap()).toBeNull();
  });

  it("computes net summary values when handicap exists", () => {
    const round: QuickRound = {
      id: "qr-1",
      courseName: "Test",
      holes: [
        { index: 1, par: 4, strokes: 5 },
        { index: 2, par: 3, strokes: 4 },
        { index: 3, par: 5, strokes: 6 },
      ],
      startedAt: new Date().toISOString(),
      handicap: 10,
    };

    const summary = computeQuickRoundSummary(round);

    expect(summary.totalPar).toBe(12);
    expect(summary.totalStrokes).toBe(15);
    expect(summary.toPar).toBe(3);
    expect(summary.netStrokes).toBeCloseTo(5);
    expect(summary.netToPar).toBeCloseTo(-7);
  });

  it("skips net values when scores are incomplete", () => {
    const round: QuickRound = {
      id: "qr-2",
      courseName: "Partial",
      holes: [
        { index: 1, par: 4, strokes: 5 },
        { index: 2, par: 4 },
      ],
      startedAt: new Date().toISOString(),
      handicap: 8,
    };

    const summary = computeQuickRoundSummary(round);

    expect(summary.toPar).toBeNull();
    expect(summary.netStrokes).toBeNull();
    expect(summary.netToPar).toBeNull();
  });
});
