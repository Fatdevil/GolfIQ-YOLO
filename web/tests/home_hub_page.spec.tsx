import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

type MockAccessState = {
  plan: "free" | "pro";
  loading: boolean;
  hasFeature: () => boolean;
};

const mockUseUserAccess = vi.hoisted(() =>
  vi.fn((): MockAccessState => ({
    plan: "free",
    loading: false,
    hasFeature: () => false,
  })),
);

vi.mock("@/access/UserAccessContext", () => ({
  useUserAccess: mockUseUserAccess,
}));

import { HomeHubPage } from "@/pages/home/HomeHubPage";

describe("HomeHubPage", () => {
  beforeEach(() => {
    mockUseUserAccess.mockReset();
    mockUseUserAccess.mockReturnValue({
      plan: "free",
      loading: false,
      hasFeature: () => false,
    });
  });

  it("renders the main heading and all mode cards", () => {
    render(
      <MemoryRouter>
        <HomeHubPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: /GolfIQ Home/i })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /Quick Round/i })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /Range practice/i })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /Trip Mode/i })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /My GolfIQ/i })).toBeTruthy();

    const links = screen.getAllByRole("link") as HTMLAnchorElement[];
    expect(links.length).toBeGreaterThanOrEqual(5);
    const hrefs = links.map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining(["/play", "/range/practice", "/trip/start", "/profile", "/settings"]),
    );
  });

  it("shows the Pro badge when the user plan is pro", () => {
    mockUseUserAccess.mockReturnValue({
      plan: "pro",
      loading: false,
      hasFeature: () => true,
    });

    render(
      <MemoryRouter>
        <HomeHubPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Pro").length).toBeGreaterThan(0);
  });
});
