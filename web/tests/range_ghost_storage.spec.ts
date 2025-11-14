import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteGhost,
  getLatestGhost,
  listGhosts,
  saveGhost,
  type GhostProfile,
} from "../src/features/range/ghost";

const STORAGE_KEY = "golfiq.range.ghosts.v1";

describe("range ghost storage", () => {
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

  it("saves ghosts and lists them in reverse chronological order", () => {
    const oldGhost: GhostProfile = {
      id: "ghost-old",
      createdAt: 1000,
      name: "Old ghost",
      config: { target_m: 150, tolerance_m: 7, maxShots: 10 },
      result: {
        totalShots: 10,
        hits: 6,
        hitRate_pct: 60,
        avgAbsError_m: 4.2,
      },
    };
    const newGhost: GhostProfile = {
      ...oldGhost,
      id: "ghost-new",
      createdAt: 2000,
      name: "New ghost",
    };

    saveGhost(oldGhost);
    saveGhost(newGhost);

    const ghosts = listGhosts();
    expect(ghosts.map((ghost) => ghost.id)).toEqual(["ghost-new", "ghost-old"]);
  });

  it("returns the latest ghost profile", () => {
    const first: GhostProfile = {
      id: "ghost-1",
      createdAt: 10,
      name: "First ghost",
      config: { target_m: 140, tolerance_m: 6, maxShots: 12 },
      result: {
        totalShots: 12,
        hits: 7,
        hitRate_pct: 58.3,
        avgAbsError_m: 3.1,
      },
    };
    const second: GhostProfile = {
      ...first,
      id: "ghost-2",
      createdAt: 20,
      name: "Second ghost",
    };

    saveGhost(first);
    saveGhost(second);

    expect(getLatestGhost()).toMatchObject({ id: "ghost-2" });
  });

  it("recovers from corrupt json in storage", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    window.localStorage.setItem(STORAGE_KEY, "not-json");

    const ghosts = listGhosts();

    expect(ghosts).toEqual([]);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    warnSpy.mockRestore();
  });

  it("removes ghost by id", () => {
    const ghost: GhostProfile = {
      id: "ghost-delete",
      createdAt: 100,
      name: "Delete me",
      config: { target_m: 120, tolerance_m: 5, maxShots: 8 },
      result: {
        totalShots: 8,
        hits: 4,
        hitRate_pct: 50,
        avgAbsError_m: 5,
      },
    };
    saveGhost(ghost);

    deleteGhost("ghost-delete");

    expect(listGhosts()).toEqual([]);
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
