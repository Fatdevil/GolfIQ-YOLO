import { describe, expect, it, beforeEach, vi } from "vitest";

const mockApiClientGet = vi.fn();
const mockWithAuth = vi.fn((extra: Record<string, string> = {}): Record<string, string> => ({
  ...extra,
  "x-api-key": "test-key",
}));

vi.mock("@/api", () => ({
  API: "https://api.example.com",
  apiClient: { get: (...args: unknown[]) => mockApiClientGet(...args) },
  withAuth: (...args: unknown[]) => mockWithAuth(...args),
}));

import { buildRunDetailCurl, buildRunsListQuery, getRunDetailV1, listRunsV1 } from "./runsV1";

describe("buildRunsListQuery", () => {
  it("serializes filters and ISO dates", () => {
    const query = buildRunsListQuery({
      q: "search",
      status: "succeeded",
      sort: "created",
      dir: "asc",
      kind: "video",
      modelVariant: "yolov10",
      createdAfter: "2025-01-01T00:00:00Z",
      createdBefore: "2025-01-02T00:00:00Z",
      cursor: "cursor-1",
      limit: 25,
    });

    expect(query).toMatchObject({
      q: "search",
      status: "succeeded",
      sort: "created",
      dir: "asc",
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
});

describe("listRunsV1", () => {
  beforeEach(() => {
    mockApiClientGet.mockReset();
    mockWithAuth.mockClear();
  });

  it("passes query params and auth headers", async () => {
    mockApiClientGet.mockResolvedValue({ data: { items: [], next_cursor: null } });

    await listRunsV1({ q: "golf", status: "failed", sort: "status", dir: "desc", cursor: "c-1", limit: 10 });

    expect(mockWithAuth).toHaveBeenCalledWith();
    expect(mockApiClientGet).toHaveBeenCalledWith("/runs/v1", {
      params: expect.objectContaining({
        q: "golf",
        status: "failed",
        sort: "status",
        dir: "desc",
        cursor: "c-1",
        limit: 10,
      }),
      headers: { "x-api-key": "test-key" },
    });
  });
});

describe("getRunDetailV1", () => {
  beforeEach(() => {
    mockApiClientGet.mockReset();
    mockWithAuth.mockClear();
  });

  it("adds auth headers when fetching run detail", async () => {
    mockApiClientGet.mockResolvedValue({ data: { run_id: "run-1" } });

    await getRunDetailV1("run-1", { "x-trace-id": "abc" });

    expect(mockWithAuth).toHaveBeenCalledWith({ "x-trace-id": "abc" });
    expect(mockApiClientGet).toHaveBeenCalledWith("/runs/v1/run-1", {
      headers: { "x-api-key": "test-key", "x-trace-id": "abc" },
    });
  });

  it("parses JSON and returns typed data", async () => {
    const payload = {
      run_id: "run-2",
      status: "succeeded",
      source: "test",
      source_type: "video",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      override_source: "header",
      created_ts: 1,
      updated_ts: 2,
      params: {},
      metrics: {},
      events: [],
      metadata: {},
    };
    mockApiClientGet.mockResolvedValue({ data: payload });

    const result = await getRunDetailV1("run-2");

    expect(result).toEqual(payload);
  });

  it("throws structured error on non-2xx", async () => {
    mockApiClientGet.mockRejectedValue({
      response: { data: { run_id: "missing", error_code: "RUN_NOT_FOUND", message: "missing" }, status: 404 },
      message: "Request failed",
    });

    await expect(getRunDetailV1("missing")).rejects.toMatchObject({
      runId: "missing",
      errorCode: "RUN_NOT_FOUND",
      message: "missing",
      status: 404,
    });
  });
});

describe("buildRunDetailCurl", () => {
  beforeEach(() => {
    mockWithAuth.mockClear();
  });

  it("includes base API path and auth headers", () => {
    mockWithAuth.mockReturnValue({ "x-api-key": "abc", Accept: "application/json", "Content-Type": "application/json" });

    const command = buildRunDetailCurl("run-99");

    expect(command).toContain("https://api.example.com/runs/v1/run-99");
    expect(command).toContain('-H "x-api-key: abc"');
    expect(command).toContain('-H "Accept: application/json"');
  });
});
