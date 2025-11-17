import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadOnboardingState, saveOnboardingState } from "@/onboarding/state";

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
  vi.unstubAllGlobals();
});

describe("onboarding state", () => {
  it("defaults to unseen when storage is empty", () => {
    const state = loadOnboardingState();
    expect(state).toEqual({ homeSeen: false });
  });

  it("persists and reloads onboarding state", () => {
    saveOnboardingState({ homeSeen: true });
    const state = loadOnboardingState();
    expect(state.homeSeen).toBe(true);
  });
});
