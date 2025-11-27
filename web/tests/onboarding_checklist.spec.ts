import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/features/quickround/storage", () => ({
  loadAllRounds: vi.fn(),
}));

vi.mock("@/features/range/sessions", () => ({
  loadRangeSessions: vi.fn(),
}));

import { computeOnboardingChecklist, markHomeSeen, markProfileSeen } from "@/onboarding/checklist";
import { loadAllRounds } from "@/features/quickround/storage";
import { loadRangeSessions } from "@/features/range/sessions";

const mockLoadAllRounds = loadAllRounds as unknown as Mock;
const mockLoadRangeSessions = loadRangeSessions as unknown as Mock;

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
  mockLoadAllRounds.mockReturnValue([]);
  mockLoadRangeSessions.mockReturnValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("computeOnboardingChecklist", () => {
  it("flags tasks as incomplete when nothing has been done", () => {
    const checklist = computeOnboardingChecklist();

    expect(checklist.allDone).toBe(false);
    expect(checklist.tasks.find((t) => t.id === "HOME_VISITED")?.done).toBe(false);
    expect(checklist.tasks.find((t) => t.id === "PLAYED_QUICKROUND")?.done).toBe(
      false,
    );
    expect(checklist.tasks.find((t) => t.id === "PLAYED_RANGE")?.done).toBe(false);
    expect(checklist.tasks.find((t) => t.id === "VIEWED_PROFILE")?.done).toBe(
      false,
    );
  });

  it("marks tasks complete when demo data exists", () => {
    mockLoadAllRounds.mockReturnValue([
      {
        id: "qr-1",
        courseId: "demo",
        courseName: "Demo",
        teesName: "Blue",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    ]);
    mockLoadRangeSessions.mockReturnValue([
      {
        id: "rs-1",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        shotCount: 10,
      },
    ]);

    markHomeSeen();
    markProfileSeen();

    const checklist = computeOnboardingChecklist();

    expect(checklist.allDone).toBe(true);
    expect(checklist.tasks.every((task) => task.done)).toBe(true);
  });
});
