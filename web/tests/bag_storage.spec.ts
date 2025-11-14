import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STORAGE_KEY,
  clearBagStorageForTests,
  loadBag,
  saveBag,
  updateClubCarry,
} from "@web/bag/storage";
import { createDefaultBag } from "@web/bag/types";

function createMockLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
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
  clearBagStorageForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bag storage", () => {
  it("returns a default bag when none is stored", () => {
    const bag = loadBag();
    expect(Array.isArray(bag.clubs)).toBe(true);
    expect(bag.clubs.length).toBeGreaterThan(0);
    expect(typeof bag.updatedAt).toBe("number");
  });

  it("persists carry values across save and load", () => {
    const initial = createDefaultBag();
    const saved = saveBag(initial);
    const targetClub = saved.clubs[0];
    const updated = updateClubCarry(saved, targetClub.id, 155);
    expect(updated.clubs.find((club) => club.id === targetClub.id)?.carry_m).toBe(155);

    const reloaded = loadBag();
    expect(reloaded.clubs.find((club) => club.id === targetClub.id)?.carry_m).toBe(155);
  });

  it("recovers from corrupt JSON in storage", () => {
    window.localStorage.setItem(STORAGE_KEY, "not-json");
    const bag = loadBag();
    expect(bag.clubs.length).toBeGreaterThan(0);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
