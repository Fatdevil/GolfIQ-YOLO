import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRoundId,
  loadAllRounds,
  loadRound,
  saveRound,
} from "../src/features/quickround/storage";
import { QuickRound } from "../src/features/quickround/types";

const STORAGE_KEY = "golfiq.quickRounds.v1";

describe("quick round storage", () => {
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

  it("saves and loads a round", () => {
    const round: QuickRound = {
      id: createRoundId(),
      courseName: "Test Course",
      holes: [
        { index: 1, par: 4 },
        { index: 2, par: 3 },
        { index: 3, par: 5 },
      ],
      startedAt: new Date().toISOString(),
    };

    saveRound(round);
    const loaded = loadRound(round.id);

    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(round.id);
    expect(loaded?.courseName).toBe("Test Course");
    expect(loaded?.holes).toHaveLength(3);
  });

  it("returns summaries without hole data", () => {
    const round: QuickRound = {
      id: "qr-summary",
      courseName: "Summary Course",
      holes: Array.from({ length: 2 }, (_, index) => ({ index: index + 1, par: 4 })),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    saveRound(round);

    const summaries = loadAllRounds();
    expect(summaries).toHaveLength(1);
    const summary = summaries[0];
    expect(summary.id).toBe("qr-summary");
    expect(summary.courseName).toBe("Summary Course");
    expect(summary.completedAt).toBeDefined();
    expect("holes" in summary).toBe(false);
  });

  it("recovers from corrupt json", () => {
    const setItemSpy = vi.spyOn(window.localStorage, "setItem");
    window.localStorage.setItem(STORAGE_KEY, "not-json");

    const rounds = loadAllRounds();

    expect(rounds).toEqual([]);
    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify([]));
  });
});

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
