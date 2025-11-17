import { act } from "react-dom/test-utils";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NotificationProvider, useNotifications } from "../src/notifications/NotificationContext";
import { ToastContainer } from "../src/notifications/ToastContainer";

const TestComponent = () => {
  const { notify } = useNotifications();
  return (
    <button type="button" onClick={() => notify("success", "Hello")}>
      Notify
    </button>
  );
};

describe("NotificationProvider", () => {
  it("shows and dismisses toasts manually", async () => {
    const user = userEvent.setup();

    render(
      <NotificationProvider>
        <TestComponent />
        <ToastContainer />
      </NotificationProvider>
    );

    expect(screen.queryByText("Hello")).toBeNull();

    const notifyButtons = screen.getAllByRole("button", { name: /notify/i });

    await user.click(notifyButtons[0]);

    expect(await screen.findByText("Hello")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "×" }));

    expect(screen.queryByText("Hello")).toBeNull();
  });

  it("auto-dismisses toasts after timeout", async () => {
    const user = userEvent.setup();

    render(
      <NotificationProvider>
        <TestComponent />
        <ToastContainer />
      </NotificationProvider>
    );

    const notifyButtons = screen.getAllByRole("button", { name: /notify/i });

    await user.click(notifyButtons[0]);

    expect(await screen.findByText("Hello")).toBeTruthy();

    await waitFor(
      () => {
        expect(screen.queryByText("Hello")).toBeNull();
      },
      { timeout: 5000 }
    );
  });
});
