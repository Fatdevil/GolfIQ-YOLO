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
  let originalWindow: Window | undefined;
  let originalLocalStorage: Storage | undefined;

  beforeEach(() => {
    const globalAny = globalThis as any;
    originalWindow = globalAny.window as Window | undefined;
    originalLocalStorage = globalAny.localStorage as Storage | undefined;

    const mockStorage = createMockStorage();
    globalAny.window = {
      ...(originalWindow ?? {}),
      localStorage: mockStorage,
    } as Window;
    globalAny.localStorage = mockStorage;
  });

  afterEach(() => {
    const globalAny = globalThis as any;
    if (typeof originalWindow === "undefined") {
      delete globalAny.window;
    } else {
      globalAny.window = originalWindow;
    }
    if (typeof originalLocalStorage === "undefined") {
      delete globalAny.localStorage;
    } else {
      globalAny.localStorage = originalLocalStorage;
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
