import { describe, expect, it, vi } from "vitest";

const mockApiClientGet = vi.fn();
const mockWithAuth = vi.fn((extra: Record<string, string> = {}) => ({ ...extra, "x-api-key": "test-key" }));

vi.mock("@/api", () => ({
  apiClient: { get: (...args: unknown[]) => mockApiClientGet(...args) },
  withAuth: (extra?: Record<string, string>) => mockWithAuth(extra),
}));

import { buildRunsListQuery, getRunDetailV1 } from "./runsV1";

describe("buildRunsListQuery", () => {
  it("serializes filters and ISO dates", () => {
    const query = buildRunsListQuery({
      status: "succeeded",
      kind: "video",
      modelVariant: "yolov10",
      createdAfter: "2025-01-01T00:00:00Z",
      createdBefore: "2025-01-02T00:00:00Z",
      cursor: "cursor-1",
      limit: 25,
    });

    expect(query).toMatchObject({
      status: "succeeded",
      kind: "video",
      model_variant: "yolov10",
      created_after: "2025-01-01T00:00:00.000Z",
      created_before: "2025-01-02T00:00:00.000Z",
      cursor: "cursor-1",
      limit: 25,
    });
  });

  it("omits invalid dates", () => {
    const query = buildRunsListQuery({
      createdAfter: "not-a-date",
      createdBefore: "",
    });
    expect(query.created_after).toBeUndefined();
    expect(query.created_before).toBeUndefined();
  });

  it("adds auth headers when fetching run detail", async () => {
    mockApiClientGet.mockResolvedValue({ data: { run_id: "run-1" } });

    await getRunDetailV1("run-1");

    expect(mockWithAuth).toHaveBeenCalled();
    expect(mockApiClientGet).toHaveBeenCalledWith("/runs/v1/run-1", {
      headers: { "x-api-key": "test-key" },
    });
  });
});
