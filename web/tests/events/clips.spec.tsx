import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ id: "event-1" }),
  };
});

vi.mock("@web/api", () => {
  return {
    fetchSpectatorBoard: vi.fn().mockResolvedValue({ players: [], updatedAt: null }),
    fetchEventClips: vi.fn().mockResolvedValue({
      items: [
        {
          id: "clip-1",
          eventId: "event-1",
          playerId: "player-1",
          hole: 5,
          status: "ready",
          srcUri: null,
          hlsUrl: "https://cdn/master.m3u8",
          mp4Url: "https://cdn/clip.mp4",
          thumbUrl: null,
          durationMs: 12000,
          fingerprint: null,
          visibility: "event",
          createdAt: new Date().toISOString(),
          reactions: { counts: {}, recentCount: 0, total: 0 },
          weight: 2.5,
        },
      ],
    }),
    postClipReaction: vi.fn().mockResolvedValue({ ok: true }),
  };
});

const api = await import("@web/api");

Object.defineProperty(globalThis, "ResizeObserver", {
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

import LiveLeaderboardPage from "@web/pages/events/[id]/live";
import ClipModal from "@web/features/clips/ClipModal";

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("events clips integration", () => {
  let playMock: Mock;
  let pauseMock: Mock;
  let loadMock: Mock;
  let originalPlay: HTMLMediaElement["play"];
  let originalPause: HTMLMediaElement["pause"];
  let originalLoad: HTMLMediaElement["load"];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    originalPlay = window.HTMLMediaElement.prototype.play;
    originalPause = window.HTMLMediaElement.prototype.pause;
    originalLoad = window.HTMLMediaElement.prototype.load;
    playMock = vi.fn(() => Promise.resolve());
    pauseMock = vi.fn();
    loadMock = vi.fn();
    Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: playMock,
    });
    Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: pauseMock,
    });
    Object.defineProperty(window.HTMLMediaElement.prototype, "load", {
      configurable: true,
      value: loadMock,
    });
  });

  afterEach(() => {
    Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: originalPlay,
    });
    Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: originalPause,
    });
    Object.defineProperty(window.HTMLMediaElement.prototype, "load", {
      configurable: true,
      value: originalLoad,
    });
    vi.useRealTimers();
  });

  it("shows clip badge when clips exist", async () => {
    render(<LiveLeaderboardPage />);
    await flushAsync();
    await vi.runOnlyPendingTimersAsync();
    const badge = screen.getByRole("button", { name: /clips available/i });
    expect(badge).toBeTruthy();
    expect(badge?.textContent ?? "").toContain("1");
  });

  it("sends reaction when clicking reaction button", async () => {
    render(<LiveLeaderboardPage />);
    await flushAsync();
    await vi.runOnlyPendingTimersAsync();
    const reactButton = screen.getAllByRole("button", { name: /🔥/i })[0];
    fireEvent.click(reactButton);
    await flushAsync();
    expect(api.postClipReaction).toHaveBeenCalledTimes(1);
    expect(api.postClipReaction).toHaveBeenCalledWith("clip-1", "🔥", { memberId: undefined, role: undefined });
  });

  it("opens modal with video when selecting a clip", async () => {
    render(<LiveLeaderboardPage />);
    await flushAsync();
    await vi.runOnlyPendingTimersAsync();
    const row = screen.getAllByText(/Hole 5/)[0];
    fireEvent.click(row);
    await flushAsync();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(document.querySelector("video")).not.toBeNull();
  });

  it("starts playback within 1.5s of opening", async () => {
    playMock.mockClear();
    const clip = {
      id: "clip-1",
      eventId: "event-1",
      playerId: "player-1",
      status: "ready",
      visibility: "event",
      createdAt: new Date().toISOString(),
      reactions: { counts: {}, recentCount: 0, total: 0 },
      weight: 1,
      hole: 5,
      hlsUrl: "https://cdn/master.m3u8",
      mp4Url: "https://cdn/clip.mp4",
    } as const;
    const { rerender } = render(
      <ClipModal clip={null} open={false} onClose={() => undefined} />,
    );
    vi.useRealTimers();
    const beforeOpen = performance.now();
    rerender(<ClipModal clip={clip} open onClose={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(playMock).toHaveBeenCalled();
    expect(performance.now() - beforeOpen).toBeLessThanOrEqual(1500);
  });
});
