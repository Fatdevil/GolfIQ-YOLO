import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomeFeed from "@web/pages/home/HomeFeed";

const mockFetchHomeFeed = vi.fn();
const mockRequested = vi.fn();
const mockRendered = vi.fn();
const mockClickClip = vi.fn();
const mockClickWatch = vi.fn();

vi.mock("@web/features/feed/api", () => ({
  fetchHomeFeed: (...args: unknown[]) => mockFetchHomeFeed(...args),
}));

vi.mock("@web/features/feed/telemetry", () => ({
  emitFeedHomeRequested: (...args: unknown[]) => mockRequested(...args),
  emitFeedHomeRendered: (...args: unknown[]) => mockRendered(...args),
  emitFeedClickClip: (...args: unknown[]) => mockClickClip(...args),
  emitFeedClickWatch: (...args: unknown[]) => mockClickWatch(...args),
}));

function renderHomeFeed() {
  return render(
    <MemoryRouter>
      <HomeFeed />
    </MemoryRouter>,
  );
}

afterEach(() => {
  mockFetchHomeFeed.mockReset();
  mockRequested.mockReset();
  mockRendered.mockReset();
  mockClickClip.mockReset();
  mockClickWatch.mockReset();
});

describe("HomeFeed", () => {
  it("renders top shots and live cards", async () => {
    mockFetchHomeFeed.mockResolvedValueOnce({
      topShots: [
        {
          clipId: "clip-1",
          eventId: "evt-1",
          sgDelta: 0.62,
          reactions1min: 3,
          reactionsTotal: 17,
          createdAt: "2024-01-02T12:00:00Z",
          anchorSec: 8,
          rankScore: 2.41,
          thumbUrl: "https://cdn.test/thumb.jpg",
        },
      ],
      live: [
        {
          eventId: "evt-live",
          viewers: 12,
          startedAt: "2024-01-02T12:00:00Z",
          livePath: "/hls/evt-live/master.m3u8",
        },
      ],
      updatedAt: "2024-01-02T12:30:00Z",
      etag: "etag-123",
    });

    const user = userEvent.setup();
    renderHomeFeed();

    expect(await screen.findByText("Clip clip-1")).toBeTruthy();
    expect(screen.getByAltText("Preview for clip clip-1")).toBeTruthy();
    expect(screen.getByText("Anchor 8s")).toBeTruthy();
    expect(screen.getByText("3 in 1m • 17 total")).toBeTruthy();
    expect(screen.getByText("Event evt-live")).toBeTruthy();
    expect(screen.getByText("12 viewers")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Play from anchor" }));
    expect(mockClickClip).toHaveBeenCalledWith({ clipId: "clip-1", eventId: "evt-1", anchorSec: 8 });
    await user.click(screen.getByRole("button", { name: "Open live viewer" }));
    expect(mockClickWatch).toHaveBeenCalledWith({ eventId: "evt-live", livePath: "/hls/evt-live/master.m3u8" });
    expect(mockRendered).toHaveBeenCalledWith({ topCount: 1, liveCount: 1 });
  });

  it("shows empty states when arrays are empty", async () => {
    mockFetchHomeFeed.mockResolvedValueOnce({
      topShots: [],
      live: [],
      updatedAt: "2024-01-03T08:00:00Z",
      etag: "etag-empty",
    });

    renderHomeFeed();

    expect(await screen.findByText(/No top shots yet/i)).toBeTruthy();
    expect(screen.getByText(/No live events at the moment/i)).toBeTruthy();
  });
});
