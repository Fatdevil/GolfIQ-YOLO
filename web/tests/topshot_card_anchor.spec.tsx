import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomeFeed from "@web/pages/home/HomeFeed";

const mockNavigate = vi.fn();
const mockFetchHomeFeed = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@web/features/feed/api", () => ({
  fetchHomeFeed: (...args: unknown[]) => mockFetchHomeFeed(...args),
}));

vi.mock("@web/features/feed/telemetry", () => ({
  emitFeedHomeRequested: vi.fn(),
  emitFeedHomeRendered: vi.fn(),
  emitFeedClickClip: vi.fn(),
  emitFeedClickWatch: vi.fn(),
}));

afterEach(() => {
  mockNavigate.mockReset();
  mockFetchHomeFeed.mockReset();
});

describe("TopShotCard navigation", () => {
  it("navigates to the clip viewer with anchor query", async () => {
    mockFetchHomeFeed.mockResolvedValueOnce({
      topShots: [
        {
          clipId: "clip-nav",
          eventId: "evt-nav",
          sgDelta: 0.5,
          reactions1min: 2,
          reactionsTotal: 9,
          createdAt: "2024-01-06T10:00:00Z",
          anchorSec: 7.5,
          rankScore: 1.8,
        },
      ],
      live: [],
      updatedAt: "2024-01-06T10:10:00Z",
      etag: "etag-nav",
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HomeFeed />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "Play from anchor" }));
    expect(mockNavigate).toHaveBeenCalledWith("/events/evt-nav/top-shots?clip=clip-nav&t=7.5");
  });
});
