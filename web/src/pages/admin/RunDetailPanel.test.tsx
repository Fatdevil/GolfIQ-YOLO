import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import RunDetailPanel from "./RunDetailPanel";
import RunsTable from "@/features/admin/runs/RunsTable";

const mockGetRunDetailV1 = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockClipboard = vi.fn();
const mockWindowOpen = vi.fn();

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
  copyToClipboard: (...args: unknown[]) => mockClipboard(...args),
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
    mockClipboard.mockResolvedValue(undefined);
    mockWindowOpen.mockReset();
    vi.stubGlobal("open", mockWindowOpen);
  });

  afterEach(() => {
    cleanup();
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

  it("renders artifacts and media links with actions", async () => {
    mockGetRunDetailV1.mockResolvedValue({
      ...baseDetail,
      status: "succeeded",
      artifacts: [{ label: "Video", url: "https://example.com/video.mp4" }],
      media: { telemetry_url: "https://example.com/telemetry.json" },
    });

    render(<RunDetailPanel runId="run-1" onClose={() => {}} />);

    const artifactSections = await screen.findAllByText("Artifacts / Links");
    expect(artifactSections.length).toBeGreaterThan(0);

    expect(screen.getByTestId("artifact-row-0")).toBeInTheDocument();
    expect(screen.getByTestId("artifact-open-0")).toBeEnabled();
    expect(screen.getByTestId("artifact-copy-0")).toHaveTextContent("Copy link");

    expect(screen.getByText("Telemetry Url")).toBeInTheDocument();
  });

  it("disables open when url is missing but allows copying key", async () => {
    mockGetRunDetailV1.mockResolvedValue({
      ...baseDetail,
      artifacts: [{ label: "Frame key", key: "s3://bucket/frame.png" }],
    });

    render(<RunDetailPanel runId="run-1" onClose={() => {}} />);

    const artifactSections = await screen.findAllByText("Artifacts / Links");
    expect(artifactSections.length).toBeGreaterThan(0);

    const openButtons = screen.getAllByTestId("artifact-open-0") as HTMLButtonElement[];
    openButtons.forEach((button: HTMLButtonElement) => expect(button).toBeDisabled());

    const copyButtons = screen.getAllByTestId("artifact-copy-0") as HTMLButtonElement[];
    expect(copyButtons.some((button: HTMLButtonElement) => !button.hasAttribute("disabled"))).toBe(true);
    fireEvent.click(copyButtons[0]);
    await waitFor(() => expect(mockClipboard).toHaveBeenCalledWith("s3://bucket/frame.png"));
  });

  it("refreshes detail without clearing current data", async () => {
    mockGetRunDetailV1.mockResolvedValue(baseDetail);

    render(<RunDetailPanel runId="run-1" onClose={() => {}} />);

    await screen.findByText("RUN_FAILED");

    fireEvent.click(screen.getByText("Refresh"));

    await waitFor(() => expect(mockGetRunDetailV1).toHaveBeenCalledTimes(2));
  });
});
