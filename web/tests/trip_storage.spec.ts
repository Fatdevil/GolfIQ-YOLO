import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearTripDefaultHandicap,
  loadTripDefaultHandicap,
  saveTripDefaultHandicap,
} from "../src/trip/storage";

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

describe("trip handicap storage", () => {
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

  it("persists and clears the default handicap", () => {
    expect(loadTripDefaultHandicap()).toBeNull();
    saveTripDefaultHandicap(9.4);
    expect(loadTripDefaultHandicap()).toBe(9.4);
    clearTripDefaultHandicap();
    expect(loadTripDefaultHandicap()).toBeNull();
  });
});
