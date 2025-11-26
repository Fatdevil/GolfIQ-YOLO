import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UpgradeGate } from "@/access/UpgradeGate";

const mockUsePlan = vi.fn();

vi.mock("@/access/PlanProvider", () => ({
  usePlan: () => mockUsePlan(),
}));

describe("UpgradeGate", () => {
  beforeEach(() => {
    mockUsePlan.mockReset();
    mockUsePlan.mockReturnValue({
      plan: "FREE",
      setPlan: vi.fn(),
      hasFeature: () => false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows upgrade overlay when feature is disabled", () => {
    mockUsePlan.mockReturnValue({
      plan: "FREE",
      setPlan: vi.fn(),
      hasFeature: () => false,
    });

    render(
      <UpgradeGate feature="SG_PREVIEW">
        <div>Inner content</div>
      </UpgradeGate>,
    );

    expect(screen.getByText(/Inner content/)).toBeTruthy();
    expect(screen.getByText(/Unlock full GolfIQ/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Try Pro mode/i })).toBeTruthy();
  });

  it("renders children directly when feature is enabled", () => {
    mockUsePlan.mockReturnValue({
      plan: "PRO",
      setPlan: vi.fn(),
      hasFeature: () => true,
    });

    render(
      <UpgradeGate feature="SG_PREVIEW">
        <div>Visible content</div>
      </UpgradeGate>,
    );

    expect(screen.getByText(/Visible content/)).toBeTruthy();
    expect(screen.queryByText(/Unlock full GolfIQ/)).toBeNull();
  });
});
