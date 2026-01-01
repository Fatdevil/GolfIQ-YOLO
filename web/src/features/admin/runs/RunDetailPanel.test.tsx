import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import RunDetailPanel from "./RunDetailPanel";

const mockGetRunDetail = vi.fn();

vi.mock("@/api/runsV1", () => ({
  getRunDetailV1: (...args: unknown[]) => mockGetRunDetail(...args),
  resolveRunsError: (err: unknown) => ({ message: String(err) }),
}));

describe("RunDetailPanel", () => {
  it("renders error contract fields", async () => {
    mockGetRunDetail.mockResolvedValue({
      run_id: "run-1",
      status: "failed",
      error_code: "RUN_FAILED",
      error_message: "Analyzer crashed",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      override_source: "header",
      source: "test",
      source_type: "video",
      params: {},
      metrics: {},
      events: [],
      created_ts: 0,
      updated_ts: 0,
      metadata: {},
      inputs: {},
      timings: {},
    });

    render(<RunDetailPanel runId="run-1" onClose={() => {}} />);

    expect(await screen.findByText("RUN_FAILED")).toBeInTheDocument();
    expect(await screen.findByText(/Analyzer crashed/)).toBeInTheDocument();
  });
});
