import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UserAccessProvider, useAccessFeatures, useAccessPlan } from "../UserAccessContext";
import type { AccessPlan } from "../types";

type Props = {
  children?: React.ReactNode;
};

function AccessProbe({ children }: Props) {
  const { plan, isPro, isFree, trial, expiresAt, loading, error } = useAccessPlan();
  const { hasPlanFeature } = useAccessFeatures();

  return (
    <div>
      <div data-testid="plan">{plan}</div>
      <div data-testid="is-pro">{String(isPro)}</div>
      <div data-testid="is-free">{String(isFree)}</div>
      <div data-testid="trial">{String(trial)}</div>
      <div data-testid="expires">{expiresAt ?? "null"}</div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="error">{error ? "yes" : "no"}</div>
      <div data-testid="hud-access">{String(hasPlanFeature("HUD_PREVIEW"))}</div>
      {children}
    </div>
  );
}

describe("UserAccessProvider", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads plan details from the backend", async () => {
    const response: AccessPlan = {
      plan: "pro",
      trial: true,
      expires_at: "2025-01-01T00:00:00Z",
    };

    const fetchPlan = vi.fn(async (): Promise<AccessPlan> => response);

    render(
      <UserAccessProvider fetchPlan={fetchPlan}>
        <AccessProbe />
      </UserAccessProvider>,
    );

    expect(screen.getByTestId("loading").textContent).toBe("true");

    await waitFor(() => {
      expect(screen.getByTestId("plan").textContent).toBe("pro");
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(screen.getByTestId("is-pro").textContent).toBe("true");
    expect(screen.getByTestId("is-free").textContent).toBe("false");
    expect(screen.getByTestId("trial").textContent).toBe("true");
    expect(screen.getByTestId("expires").textContent).toBe("2025-01-01T00:00:00Z");
    expect(screen.getByTestId("hud-access").textContent).toBe("true");
    expect(screen.getByTestId("error").textContent).toBe("no");
  });

  it("falls back to free when the plan fetch fails", async () => {
    const fetchPlan = vi.fn(async (): Promise<AccessPlan> => {
      throw new Error("nope");
    });

    render(
      <UserAccessProvider fetchPlan={fetchPlan}>
        <AccessProbe />
      </UserAccessProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(screen.getByTestId("plan").textContent).toBe("free");
    expect(screen.getByTestId("is-pro").textContent).toBe("false");
    expect(screen.getByTestId("is-free").textContent).toBe("true");
    expect(screen.getByTestId("error").textContent).toBe("yes");
  });

  it("reuses initial plan when autoFetch is disabled", () => {
    render(
      <UserAccessProvider autoFetch={false} initialPlan="pro">
        <AccessProbe />
      </UserAccessProvider>,
    );

    expect(screen.getByTestId("plan").textContent).toBe("pro");
    expect(screen.getByTestId("hud-access").textContent).toBe("true");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });
});
