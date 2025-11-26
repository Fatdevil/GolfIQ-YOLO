import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { PlanProvider } from "@/access/PlanProvider";
import { UserAccessProvider } from "@/access/UserAccessContext";
import { HomeHubPage } from "@/pages/home/HomeHubPage";

const renderHome = (plan: "FREE" | "PRO" = "FREE") => {
  if (plan === "PRO") {
    window.localStorage.setItem("golfiq_plan_v1", "PRO");
  } else {
    window.localStorage.removeItem("golfiq_plan_v1");
  }

  return render(
    <UserAccessProvider autoFetch={false} initialPlan={plan === "PRO" ? "pro" : "free"}>
      <PlanProvider>
        <MemoryRouter>
          <HomeHubPage />
        </MemoryRouter>
      </PlanProvider>
    </UserAccessProvider>,
  );
};

describe("HomeHubPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders home hub with entry cards and free plan badge", () => {
    renderHome();

    expect(screen.getByText(/GolfIQ Home/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Start Quick Round/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open range practice/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /View My GolfIQ/i })).toBeTruthy();
    expect(screen.getAllByText(/Free/i).length).toBeGreaterThan(0);
  });

  it("shows Pro plan messaging and unlocked card for pro users", async () => {
    renderHome("PRO");

    expect((await screen.findAllByText(/Pro/i)).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Caddie insights unlocked/i)).toBeTruthy();
  });
});
