import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import RunDetailPanel from "./RunDetailPanel";
import RunsTable from "@/features/admin/runs/RunsTable";

const mockGetRunDetailV1 = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock("@/api/runsV1", () => ({
  getRunDetailV1: (...args: unknown[]) => mockGetRunDetailV1(...args),
  resolveRunsError: (err: unknown) => ({ message: String(err) }),
}));

vi.mock("@/ui/toast", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

vi.mock("@/utils/copy", () => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}));

const baseDetail = {
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
};

function Wrapper() {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  return (
    <>
      <RunsTable
        runs={[
          {
            run_id: "run-1",
            status: "succeeded",
            kind: "video",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
            override_source: "header",
            source: "test",
            source_type: "video",
          },
        ]}
        loading={false}
        error={null}
        onSelect={setSelectedRunId}
      />
      {selectedRunId ? <RunDetailPanel runId={selectedRunId} onClose={() => setSelectedRunId(null)} /> : null}
    </>
  );
}

describe("RunDetailPanel", () => {
  beforeEach(() => {
    mockGetRunDetailV1.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  it("opens detail when a row is clicked", async () => {
    mockGetRunDetailV1.mockResolvedValue(baseDetail);

    render(<Wrapper />);

    fireEvent.click(screen.getByTestId("run-row-run-1"));

    await screen.findByText("RUN_FAILED");
    expect(mockGetRunDetailV1).toHaveBeenCalledWith("run-1");
  });

  it("shows loading then data", async () => {
    let resolveDetail: (value: unknown) => void = () => undefined;
    const deferred = new Promise((resolve) => {
      resolveDetail = resolve;
    });
    mockGetRunDetailV1.mockReturnValue(deferred);

    render(<RunDetailPanel runId="run-1" onClose={() => {}} />);

    expect(screen.getByText("Loading run…")).toBeInTheDocument();

    resolveDetail({ ...baseDetail, status: "succeeded" });

    await screen.findByText("succeeded");
  });

  it("renders 404 state with helpful copy", async () => {
    mockGetRunDetailV1.mockRejectedValue({ message: "missing", status: 404 });

    render(<RunDetailPanel runId="missing" onClose={() => {}} />);

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(await screen.findByText("Run not found")).toBeInTheDocument();
    expect(screen.queryByText("Retry")).not.toBeInTheDocument();
  });
});
