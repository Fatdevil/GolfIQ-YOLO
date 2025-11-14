import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadBundleFromCache, saveBundleToCache, __testing } from "../src/courses/storage";
import type { CourseBundle } from "../src/courses/types";

const { STORAGE_KEY } = __testing;

let originalWindowDescriptor: PropertyDescriptor | undefined;
let originalGlobalDescriptor: PropertyDescriptor | undefined;

describe("course bundle storage", () => {
  beforeEach(() => {
    const memoryStorage = createMemoryStorage();
    originalWindowDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    originalGlobalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: memoryStorage,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: memoryStorage,
    });
  });

  afterEach(() => {
    if (originalWindowDescriptor) {
      Object.defineProperty(window, "localStorage", originalWindowDescriptor);
    } else {
      delete (window as unknown as { localStorage?: Storage }).localStorage;
    }
    if (originalGlobalDescriptor) {
      Object.defineProperty(globalThis, "localStorage", originalGlobalDescriptor);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("saves and loads bundles", () => {
    const bundle: CourseBundle = {
      id: "demo",
      name: "Demo Course",
      country: "USA",
      holes: [],
      version: 1,
    };

    saveBundleToCache(bundle);
    const loaded = loadBundleFromCache("demo");

    expect(loaded).toEqual(bundle);
  });

  it("returns null on corrupt storage", () => {
    window.localStorage.setItem(STORAGE_KEY, "not-json");

    const loaded = loadBundleFromCache("demo");

    expect(loaded).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
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
