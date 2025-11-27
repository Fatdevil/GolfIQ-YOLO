import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UpgradeGate } from "../UpgradeGate";

const useAccessPlan = vi.fn();
const useAccessFeatures = vi.fn();

vi.mock("../UserAccessContext", () => ({
  useAccessPlan: () => useAccessPlan(),
  useAccessFeatures: () => useAccessFeatures(),
}));

describe("UpgradeGate", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading while the plan is being fetched", () => {
    useAccessPlan.mockReturnValue({ plan: "free", loading: true, refresh: vi.fn() });
    useAccessFeatures.mockReturnValue({
      hasPlanFeature: vi.fn().mockReturnValue(false),
      hasFeature: vi.fn(),
      loading: true,
    });

    render(
      <UpgradeGate feature="SG_PREVIEW">
        <div>Pro content</div>
      </UpgradeGate>,
    );

    expect(screen.getByText(/checking your plan/i)).toBeInTheDocument();
  });

  it("renders children when feature is allowed", () => {
    useAccessPlan.mockReturnValue({ plan: "pro", loading: false, refresh: vi.fn() });
    useAccessFeatures.mockReturnValue({ hasPlanFeature: vi.fn().mockReturnValue(true) });

    render(
      <UpgradeGate feature="CADDIE_INSIGHTS">
        <div>Unlocked</div>
      </UpgradeGate>,
    );

    expect(screen.getByText("Unlocked")).toBeInTheDocument();
  });

  it("renders upgrade overlay when feature is blocked", () => {
    useAccessPlan.mockReturnValue({ plan: "free", loading: false, refresh: vi.fn() });
    useAccessFeatures.mockReturnValue({ hasPlanFeature: vi.fn().mockReturnValue(false) });

    render(
      <UpgradeGate feature="SG_PREVIEW">
        <div>Hidden content</div>
      </UpgradeGate>,
    );

    expect(screen.getByText(/upgrade/i)).toBeInTheDocument();
    expect(screen.queryByText("Hidden content")).not.toBeNull();
  });
});
