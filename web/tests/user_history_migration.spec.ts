import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { migrateLocalHistoryOnce, hasMigratedHistory } from "@/user/historyMigration";
import type { QuickRound } from "@/features/quickround/types";
import type { RangeSession } from "@/features/range/sessions";

const postQuickRoundSnapshots = vi.hoisted(() => vi.fn<() => Promise<void>>());
const postRangeSessionSnapshots = vi.hoisted(() => vi.fn<() => Promise<void>>());

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  } satisfies Storage;
})();

vi.mock("@/user/historyApi", () => ({
  postQuickRoundSnapshots,
  postRangeSessionSnapshots,
}));

describe("history migration", () => {
  const rounds: QuickRound[] = [
    {
      id: "qr-1",
      courseName: "Test Course",
      holes: [{ index: 1, par: 4, strokes: 5 }],
      startedAt: "2024-01-01T10:00:00.000Z",
      completedAt: "2024-01-01T11:00:00.000Z",
    },
  ];

  const rangeSessions: RangeSession[] = [
    {
      id: "rs-1",
      startedAt: "2024-02-01T10:00:00.000Z",
      endedAt: "2024-02-01T11:00:00.000Z",
      shotCount: 10,
    },
  ];

  beforeEach(() => {
    const fakeWindow = { localStorage: localStorageMock } as unknown as
      | Window
      | typeof globalThis;
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("localStorage", localStorageMock);
    localStorage.clear();
    vi.clearAllMocks();
    postQuickRoundSnapshots.mockResolvedValue(undefined);
    postRangeSessionSnapshots.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("migrates once per user", async () => {
    await migrateLocalHistoryOnce("user-1", rounds, rangeSessions);

    expect(postQuickRoundSnapshots).toHaveBeenCalledTimes(1);
    expect(postRangeSessionSnapshots).toHaveBeenCalledTimes(1);
    expect(hasMigratedHistory("user-1")).toBe(true);

    await migrateLocalHistoryOnce("user-1", rounds, rangeSessions);

    expect(postQuickRoundSnapshots).toHaveBeenCalledTimes(1);
    expect(postRangeSessionSnapshots).toHaveBeenCalledTimes(1);
  });
});
