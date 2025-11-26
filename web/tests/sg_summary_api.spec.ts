import { afterEach, describe, expect, it, vi } from "vitest";

const getSpy = vi.hoisted(() => vi.fn());

vi.mock("../src/api", () => ({
  apiClient: { get: getSpy },
}));

import { fetchMemberSgSummary, type MemberSgSummary } from "../src/api/sgSummary";

describe("sg summary api client", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetches a member summary with limit", async () => {
    const payload: MemberSgSummary = {
      memberId: "m1",
      runIds: ["run-1"],
      total_sg: 1.2,
      avg_sg_per_round: 1.2,
      per_category: {
        TEE: { category: "TEE", total_sg: 0.5, avg_sg: 0.5, rounds: 1 },
        APPROACH: {
          category: "APPROACH",
          total_sg: 0.4,
          avg_sg: 0.4,
          rounds: 1,
        },
        SHORT: { category: "SHORT", total_sg: 0.2, avg_sg: 0.2, rounds: 1 },
        PUTT: { category: "PUTT", total_sg: 0.1, avg_sg: 0.1, rounds: 1 },
      },
    };

    getSpy.mockResolvedValue({ data: payload });

    const data = await fetchMemberSgSummary("m1", 5);

    expect(data).toEqual(payload);
    expect(getSpy).toHaveBeenCalledWith("/api/sg/member/m1", { params: { limit: 5 } });
  });
});
