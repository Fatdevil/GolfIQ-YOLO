import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ShareLandingPage from "../ShareLandingPage";
import { apiFetch } from "@/api";
import { GOLFIQ_DOWNLOAD_URL } from "@/config/shareConfig";

vi.mock("@/api", () => ({ apiFetch: vi.fn() }));

const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

function renderWithRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/s/:sid" element={<ShareLandingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ShareLandingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.title = "";
    document.head.querySelectorAll("meta[property^='og'], meta[name='description']").forEach((tag) => tag.remove());
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a round share payload", async () => {
    mockApiFetch.mockResolvedValue(
      mockResponse({
        sid: "abc123",
        type: "round",
        round: {
          roundId: "round-1",
          courseName: "Demo GC",
          score: 82,
          toPar: "+10",
          date: "2025-06-01",
          headline: "Strong wedges carried your round.",
          highlights: ["3 birdies on back nine", "Best putting week so far"],
        },
      }),
    );

    renderWithRoute("/s/abc123");

    await waitFor(() => expect(screen.getByText(/Round at Demo GC/i)).toBeInTheDocument());
    expect(screen.getByText(/Score: 82/i)).toBeInTheDocument();
    expect(screen.getByText(/Strong wedges carried your round./i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Get GolfIQ/i })).toHaveAttribute("href", GOLFIQ_DOWNLOAD_URL);
    await waitFor(() => expect(document.title).toContain("Demo GC"));
  });

  it("renders a weekly share payload", async () => {
    mockApiFetch.mockResolvedValue(
      mockResponse({
        sid: "weekly-1",
        type: "weekly",
        weekly: {
          period: { from: "2025-06-01", to: "2025-06-07" },
          roundCount: 4,
          avgScore: 83,
          headline: "Your putting carried this week.",
          highlights: ["SG Putting +1.4 vs avg", "Fairway hits up 10%"],
        },
      }),
    );

    renderWithRoute("/s/weekly-1");

    await waitFor(() => expect(screen.getByText(/Weekly performance/i)).toBeInTheDocument());
    expect(screen.getByText(/Rounds: 4/i)).toBeInTheDocument();
    expect(screen.getByText(/Your putting carried this week./i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Get GolfIQ/i })).toHaveAttribute("href", GOLFIQ_DOWNLOAD_URL);
  });

  it("shows an error state on 404", async () => {
    mockApiFetch.mockResolvedValue(mockResponse({ detail: "Share link not found" }, 404));

    renderWithRoute("/s/missing");

    await waitFor(() =>
      expect(
        screen.getByText(/This GolfIQ share link has expired or is not yet supported on the web./i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: /Download GolfIQ/i })).toHaveAttribute("href", GOLFIQ_DOWNLOAD_URL);
  });
});
