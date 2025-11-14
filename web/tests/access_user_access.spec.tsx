import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  UserAccessProvider,
  useFeatureFlag,
  useUserAccess,
} from "@web/access/UserAccessContext";
import type { FeatureId } from "@web/access/types";

type ProbeProps = {
  feature: FeatureId;
};

const AccessProbe = ({ feature }: ProbeProps) => {
  const { plan, loading } = useUserAccess();
  const { enabled } = useFeatureFlag(feature);
  return (
    <div>
      <span data-testid="plan">{plan}</span>
      <span data-testid="loading">{loading ? "loading" : "ready"}</span>
      <span data-testid="feature">{enabled ? "yes" : "no"}</span>
    </div>
  );
};

describe("UserAccessProvider", () => {
  afterEach(() => {
    cleanup();
  });

  it("loads plan information and enables pro features when available", async () => {
    render(
      <UserAccessProvider fetchPlan={async () => ({ plan: "pro" })}>
        <AccessProbe feature="range.ghostMatch" />
      </UserAccessProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("ready"));
    expect(screen.getByTestId("plan").textContent).toBe("pro");
    expect(screen.getByTestId("feature").textContent).toBe("yes");
  });

  it("falls back to free plan and disables gated features", async () => {
    render(
      <UserAccessProvider fetchPlan={async () => ({ plan: "free" })}>
        <AccessProbe feature="range.ghostMatch" />
      </UserAccessProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("ready"));
    expect(screen.getByTestId("plan").textContent).toBe("free");
    expect(screen.getByTestId("feature").textContent).toBe("no");
  });
});
