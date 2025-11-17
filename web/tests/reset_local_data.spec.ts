import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetLocalData } from "@/preferences/resetLocalData";

describe("resetLocalData", () => {
  const removeItem = vi.fn();

  const mockStorageFactory = (): Storage => ({
    length: 0,
    clear: vi.fn(),
    getItem: vi.fn(),
    key: vi.fn(),
    setItem: vi.fn(),
    removeItem,
  });

  const originalWindowDescriptor =
    typeof window === "undefined"
      ? undefined
      : Object.getOwnPropertyDescriptor(window, "localStorage");
  const originalGlobalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

  beforeEach(() => {
    removeItem.mockReset();
    const storage = mockStorageFactory();

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
    });

    if (typeof window !== "undefined") {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: storage,
      });
    }
  });

  it("removes the selected local storage keys", () => {
    resetLocalData(["bag", "preferences"]);

    expect(removeItem).toHaveBeenCalledWith("golfiq.bag.v1");
    expect(removeItem).toHaveBeenCalledWith("golfiq.lang");
    expect(removeItem).toHaveBeenCalledWith("golfiq.units.v1");
  });

  afterAll(() => {
    if (originalGlobalDescriptor) {
      Object.defineProperty(globalThis, "localStorage", originalGlobalDescriptor);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }

    if (originalWindowDescriptor) {
      Object.defineProperty(window, "localStorage", originalWindowDescriptor);
    } else if (typeof window !== "undefined") {
      delete (window as { localStorage?: Storage }).localStorage;
    }
  });
});
