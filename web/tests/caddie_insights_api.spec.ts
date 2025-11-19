import axios from "axios";
import { describe, expect, it, vi } from "vitest";

import { API, fetchCaddieInsights } from "@/api";

vi.mock("axios");

const mockInsights = {
  memberId: "m1",
  from_ts: "2024-01-01T00:00:00Z",
  to_ts: "2024-02-01T00:00:00Z",
  advice_shown: 5,
  advice_accepted: 3,
  accept_rate: 0.6,
  per_club: [],
};

describe("fetchCaddieInsights", () => {
  it("requests insights with correct parameters", async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: mockInsights });

    const result = await fetchCaddieInsights("m1", 7);

    expect(axios.get).toHaveBeenCalledWith(`${API}/api/caddie/insights`, {
      headers: expect.any(Object),
      params: { memberId: "m1", windowDays: 7 },
    });
    expect(result).toEqual(mockInsights);
  });
});
