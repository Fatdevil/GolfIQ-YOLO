import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCourseBundle, useCourseIds } from "../src/courses/hooks";
import type { CourseBundle } from "../src/courses/types";

let originalWindowDescriptor: PropertyDescriptor | undefined;
let originalGlobalDescriptor: PropertyDescriptor | undefined;

describe("course bundle hooks", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
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

  it("loads course ids", async () => {
    const ids = ["demo-course-1"];
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ids,
    });

    const { result } = renderHook(() => useCourseIds());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(ids);
    expect(fetchMock).toHaveBeenCalledWith("/api/courses", expect.any(Object));
  });

  it("loads course bundles and caches them", async () => {
    const bundle: CourseBundle = {
      id: "demo",
      name: "Demo Course",
      country: "USA",
      holes: [],
      version: 1,
    };
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => bundle,
    });
    const setItemSpy = vi.spyOn(window.localStorage, "setItem");

    const { result } = renderHook(() => useCourseBundle("demo"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(bundle);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/courses/demo/bundle",
      expect.any(Object)
    );
    expect(setItemSpy).toHaveBeenCalled();
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
