import React from "react";
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { UserSessionProvider, useUserSession } from "@/user/UserSessionContext";

const SessionConsumer = () => {
  const { session, loading } = useUserSession();
  return (
    <div>
      <div data-testid="loading">{loading ? "loading" : "ready"}</div>
      <div data-testid="userId">{session?.userId ?? "none"}</div>
    </div>
  );
};

describe("UserSessionProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates a session when none exists", async () => {
    render(
      <UserSessionProvider>
        <SessionConsumer />
      </UserSessionProvider>
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("ready"));
    const userId = screen.getByTestId("userId").textContent;
    expect(userId).not.toBe("none");
    expect(userId?.length ?? 0).toBeGreaterThan(0);
  });
});
