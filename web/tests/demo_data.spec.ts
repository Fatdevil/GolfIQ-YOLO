import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/features/quickround/storage", () => ({
  saveRound: vi.fn(),
}));

vi.mock("@/features/range/sessions", () => ({
  appendRangeSession: vi.fn(),
  loadRangeSessions: vi.fn(),
  saveRangeSessions: vi.fn(),
}));

import { seedDemoData } from "@/demo/demoData";
import { saveRound } from "@/features/quickround/storage";
import {
  appendRangeSession,
  loadRangeSessions,
  saveRangeSessions,
} from "@/features/range/sessions";

const mockSaveRound = saveRound as unknown as Mock;
const mockAppendRangeSession = appendRangeSession as unknown as Mock;
const mockLoadRangeSessions = loadRangeSessions as unknown as Mock;
const mockSaveRangeSessions = saveRangeSessions as unknown as Mock;

beforeEach(() => {
  mockSaveRound.mockReset();
  mockAppendRangeSession.mockReset();
  mockSaveRangeSessions.mockReset();
  mockLoadRangeSessions.mockReset();
  mockLoadRangeSessions.mockReturnValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("seedDemoData", () => {
  it("stores demo rounds and range sessions", async () => {
    await seedDemoData();

    expect(mockSaveRound).toHaveBeenCalled();
    const savedRounds = mockSaveRound.mock.calls.map(([arg]) => arg);
    expect(savedRounds.length).toBeGreaterThanOrEqual(2);
    expect(savedRounds[0]).toHaveProperty("holes");

    expect(mockAppendRangeSession).toHaveBeenCalledTimes(2);
    const appendedIds = mockAppendRangeSession.mock.calls.map(([session]) => session.id);
    expect(appendedIds).toContain("demo-range-1");
    expect(appendedIds).toContain("demo-range-2");

    expect(mockSaveRangeSessions).toHaveBeenCalled();
  });
});
