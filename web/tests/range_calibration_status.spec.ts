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
  beforeEach(() => {
    const mockStorage = createMockStorage();
    (globalThis as Record<string, unknown>).window = {
      ...((globalThis as Record<string, unknown>).window as Record<string, unknown> | undefined),
      localStorage: mockStorage,
    } as Window;
    (globalThis as Record<string, unknown>).localStorage = mockStorage;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).localStorage;
    delete (globalThis as Record<string, unknown>).window;
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
