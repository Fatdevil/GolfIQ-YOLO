import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UpgradeGate } from "@/access/UpgradeGate";

const mockUseAccessPlan = vi.fn();
const mockUseAccessFeatures = vi.fn();

vi.mock("@/access/UserAccessContext", () => ({
  useAccessPlan: () => mockUseAccessPlan(),
  useAccessFeatures: () => mockUseAccessFeatures(),
}));

describe("UpgradeGate", () => {
  beforeEach(() => {
    mockUseAccessPlan.mockReset();
    mockUseAccessFeatures.mockReset();

    mockUseAccessPlan.mockReturnValue({
      plan: "free",
      isPro: false,
      isFree: true,
      loading: false,
      refresh: vi.fn(),
      error: undefined,
    });
    mockUseAccessFeatures.mockReturnValue({
      hasPlanFeature: () => false,
      hasFeature: () => false,
      loading: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows upgrade overlay when feature is disabled", () => {
    mockUseAccessPlan.mockReturnValue({
      plan: "free",
      isPro: false,
      isFree: true,
      loading: false,
      refresh: vi.fn(),
      error: undefined,
    });
    mockUseAccessFeatures.mockReturnValue({
      hasPlanFeature: () => false,
      hasFeature: () => false,
      loading: false,
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
    mockUseAccessPlan.mockReturnValue({
      plan: "pro",
      isPro: true,
      isFree: false,
      loading: false,
      refresh: vi.fn(),
      error: undefined,
    });
    mockUseAccessFeatures.mockReturnValue({
      hasPlanFeature: () => true,
      hasFeature: () => true,
      loading: false,
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
