import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadCalibrationStatus,
  saveCalibrationStatus,
} from "@/features/range/calibrationStatus";

const createMockStorage = () => {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  return storage;
};

describe("calibration status storage", () => {
  let originalWindow: (Window & typeof globalThis) | undefined;
  let originalLocalStorage: Storage | undefined;

  beforeEach(() => {
    originalWindow = (globalThis as typeof globalThis & { window?: Window }).window;
    originalLocalStorage = (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;

    const mockStorage = createMockStorage();
    const baseWindow = (originalWindow ?? {}) as Record<string, unknown>;
    (globalThis as Record<string, unknown>).window = {
      ...baseWindow,
      localStorage: mockStorage,
    } as Window;
    (globalThis as Record<string, unknown>).localStorage = mockStorage;
  });

  afterEach(() => {
    if (typeof originalWindow === "undefined") {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as Record<string, unknown>).window = originalWindow;
    }
    if (typeof originalLocalStorage === "undefined") {
      delete (globalThis as Record<string, unknown>).localStorage;
    } else {
      (globalThis as Record<string, unknown>).localStorage = originalLocalStorage;
    }
  });

  it("returns uncalibrated when storage empty", () => {
    expect(loadCalibrationStatus()).toEqual({ calibrated: false });
  });

  it("saves and loads calibration state", () => {
    saveCalibrationStatus({ calibrated: true });
    const status = loadCalibrationStatus();
    expect(status.calibrated).toBe(true);
    expect(typeof status.lastUpdatedAt).toBe("string");
  });
});
