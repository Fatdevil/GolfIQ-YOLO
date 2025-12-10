import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WEEKLY_PRACTICE_GOAL_SETTINGS_KEY,
  loadWeeklyPracticeGoalSettings,
  saveWeeklyPracticeGoalSettings,
} from "@/practice/practiceGoalSettings";
import {
  DEFAULT_TARGET_MISSIONS_PER_WEEK,
  getDefaultWeeklyPracticeGoalSettings,
  normalizeWeeklyPracticeGoalSettings,
} from "@shared/practice/practiceGoalSettings";

describe("practice goal settings (web)", () => {
  const storage: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: vi.fn((key: string) => storage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete storage[key];
    }),
    clear: vi.fn(() => {
      Object.keys(storage).forEach((key) => delete storage[key]);
    }),
  };

  beforeEach(() => {
    mockLocalStorage.clear();
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
    mockLocalStorage.removeItem.mockClear();
    vi.stubGlobal("window", { localStorage: mockLocalStorage } as unknown as Window);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns default settings when nothing is stored", () => {
    const settings = loadWeeklyPracticeGoalSettings();

    expect(settings.targetMissionsPerWeek).toBe(DEFAULT_TARGET_MISSIONS_PER_WEEK);
  });

  it("returns normalized settings when value is stored", () => {
    window.localStorage.setItem(
      WEEKLY_PRACTICE_GOAL_SETTINGS_KEY,
      JSON.stringify({ targetMissionsPerWeek: 5 }),
    );

    const settings = loadWeeklyPracticeGoalSettings();

    expect(settings.targetMissionsPerWeek).toBe(5);
  });

  it("falls back to defaults when payload is invalid", () => {
    window.localStorage.setItem(WEEKLY_PRACTICE_GOAL_SETTINGS_KEY, "not-json");

    const settings = loadWeeklyPracticeGoalSettings();

    expect(settings).toEqual(getDefaultWeeklyPracticeGoalSettings());
  });

  it("persists minimal payload", () => {
    const spy = vi.spyOn(window.localStorage, "setItem");

    saveWeeklyPracticeGoalSettings({ targetMissionsPerWeek: 4 });

    expect(spy).toHaveBeenCalledWith(
      WEEKLY_PRACTICE_GOAL_SETTINGS_KEY,
      JSON.stringify(normalizeWeeklyPracticeGoalSettings({ targetMissionsPerWeek: 4 })),
    );
  });
});
