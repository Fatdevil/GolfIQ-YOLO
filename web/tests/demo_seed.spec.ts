import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as bagStorage from "@/bag/storage";
import * as rangeSessions from "@/features/range/sessions";
import { QUICK_ROUNDS_STORAGE_KEY } from "@/features/quickround/demoStorage";
import { seedDemoData } from "@/onboarding/demoSeed";

const RANGE_SESSIONS_KEY = "golfiq.range.sessions.v1";

function createMockLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } satisfies Storage;
}

beforeEach(() => {
  const storage = createMockLocalStorage();
  vi.stubGlobal("window", { localStorage: storage } as Window & typeof globalThis);
  vi.stubGlobal("localStorage", storage);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("demo seed", () => {
  it("seeds bag, range sessions and quick rounds", async () => {
    const bagSpy = vi.spyOn(bagStorage, "saveBag");
    const rangeSpy = vi.spyOn(rangeSessions, "saveRangeSessions");

    await seedDemoData();

    expect(bagSpy).toHaveBeenCalled();
    expect(rangeSpy).toHaveBeenCalled();

    expect(window.localStorage.getItem(bagStorage.STORAGE_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(RANGE_SESSIONS_KEY)).not.toBeNull();

    const quickRoundsRaw = window.localStorage.getItem(QUICK_ROUNDS_STORAGE_KEY);
    expect(quickRoundsRaw).not.toBeNull();
    const parsed = quickRoundsRaw ? JSON.parse(quickRoundsRaw) : null;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed?.length).toBeGreaterThan(0);
  });
});
