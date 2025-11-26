// @vitest-environment jsdom
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCoachInsights } from "@/profile/useCoachInsights";
import type { QuickRound } from "@/features/quickround/types";

const mockMemberId = "member-123";
const mockRounds: QuickRound[] = [
  {
    id: "r1",
    runId: "run-1",
    courseName: "Course 1",
    holes: [],
    startedAt: "2024-01-02T00:00:00Z",
  },
];

const loadAllRoundsFull = vi.hoisted(() => vi.fn(() => mockRounds));
const fetchSgPreview = vi.hoisted(() => vi.fn(async () => ({
  runId: "run-1",
  courseId: "course-1",
  total_sg: -2,
  sg_by_cat: { TEE: -1.2, APPROACH: 0, SHORT: 0.1, PUTT: -0.1 },
  holes: [],
})));
const fetchCaddieInsights = vi.hoisted(() => vi.fn(async () => ({
  memberId: mockMemberId,
  from_ts: "2024-01-01T00:00:00Z",
  to_ts: "2024-02-01T00:00:00Z",
  advice_shown: 12,
  advice_accepted: 6,
  accept_rate: 0.5,
  per_club: [{ club: "7i", shown: 8, accepted: 3 }],
})));
const useCaddieMemberId = vi.hoisted(() => vi.fn(() => mockMemberId));

vi.mock("@/features/quickround/storage", () => ({
  loadAllRoundsFull: (...args: Parameters<typeof loadAllRoundsFull>) =>
    loadAllRoundsFull(...args),
}));

vi.mock("@/api/sgPreview", () => ({
  fetchSgPreview: (...args: Parameters<typeof fetchSgPreview>) => fetchSgPreview(...args),
}));

vi.mock("@/api/caddieInsights", () => ({
  fetchCaddieInsights: (...args: Parameters<typeof fetchCaddieInsights>) =>
    fetchCaddieInsights(...args),
}));

vi.mock("@/profile/memberIdentity", () => ({
  useCaddieMemberId: () => useCaddieMemberId(),
}));

describe("useCoachInsights", () => {
  it("combines SG and caddie data into suggestions", async () => {
    const { result } = renderHook(() => useCoachInsights());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.status).toBe("ready");
    if (result.current.status === "ready") {
      expect(result.current.suggestions.length).toBeGreaterThan(0);
    }
  });
});
