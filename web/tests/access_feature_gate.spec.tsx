import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import FeatureGate from "@web/access/FeatureGate";
import { UserAccessContext } from "@web/access/UserAccessContext";
import type { FeatureId, PlanName } from "@web/access/types";

type ContextValue = {
  loading: boolean;
  plan: PlanName;
  hasFeature: (feature: FeatureId) => boolean;
};

const createWrapper = (value: ContextValue) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <UserAccessContext.Provider
        value={{
          trial: null,
          expiresAt: null,
          error: undefined,
          isPro: value.plan === "pro",
          isFree: value.plan === "free",
          hasPlanFeature: () => value.plan === "pro",
          refresh: async () => undefined,
          ...value,
        }}
      >
        {children}
      </UserAccessContext.Provider>
    );
  };

describe("FeatureGate", () => {
  it("renders children when feature is enabled", () => {
    render(
      <FeatureGate feature="range.ghostMatch">Allowed</FeatureGate>,
      {
        wrapper: createWrapper({
          loading: false,
          plan: "pro",
          hasFeature: () => true,
        }),
      },
    );

    expect(screen.getByText("Allowed")).toBeTruthy();
    expect(screen.queryByText(/Pro feature/i)).toBeNull();
  });

  it("shows upgrade teaser when feature is disabled", () => {
    render(
      <FeatureGate feature="range.ghostMatch">Hidden</FeatureGate>,
      {
        wrapper: createWrapper({
          loading: false,
          plan: "free",
          hasFeature: () => false,
        }),
      },
    );

    expect(screen.getByText(/This is a Pro feature/i)).toBeTruthy();
    expect(screen.queryByText("Hidden")).toBeNull();
  });

  it("shows loading state while plan is loading", () => {
    render(
      <FeatureGate feature="range.ghostMatch">Loading</FeatureGate>,
      {
        wrapper: createWrapper({
          loading: true,
          plan: "free",
          hasFeature: () => false,
        }),
      },
    );

    expect(screen.getByText(/Checking your plan/)).toBeTruthy();
  });
});
