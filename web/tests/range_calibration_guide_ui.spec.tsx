import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CalibrationGuide } from "@/features/range/CalibrationGuide";

describe("CalibrationGuide", () => {
  it("renders title and steps", () => {
    render(<CalibrationGuide onClose={() => {}} />);

    expect(
      screen.getByText(/Set up your camera for ball tracking/i),
    ).toBeTruthy();
    [
      /Place the phone behind the ball/i,
      /Tilt the camera/i,
      /Run the calibration wizard/i,
      /Use the test shot button/i,
    ].forEach((matcher) => {
      expect(screen.getByText(matcher)).toBeTruthy();
    });
  });

  it("calls onClose when clicking button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CalibrationGuide onClose={onClose} />);

    const buttons = screen.getAllByRole("button", { name: /Close guide/i });
    await user.click(buttons[buttons.length - 1]!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
