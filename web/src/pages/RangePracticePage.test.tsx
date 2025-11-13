import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  postMockAnalyze: vi.fn(),
}));

import { postMockAnalyze } from "../api";
import RangePracticePage from "./RangePracticePage";

const mockedPostMockAnalyze = vi.mocked(postMockAnalyze);

describe("RangePracticePage", () => {
  beforeEach(() => {
    mockedPostMockAnalyze.mockReset();
  });

  it("logs a shot and updates UI", async () => {
    mockedPostMockAnalyze.mockResolvedValue({
      metrics: {
        ball_speed_mps: 60,
        ball_speed_mph: 134,
        carry_m: 180,
        launch_deg: 12,
        side_angle_deg: -3,
        quality: "good",
      },
    });

    render(<RangePracticePage />);

    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/Club/i), "PW");
    await user.click(screen.getByRole("button", { name: /Hit & analyze/i }));

    await waitFor(() => expect(mockedPostMockAnalyze).toHaveBeenCalledTimes(1));

    await screen.findByText("134.0 mph");
    await screen.findByText("180.0 m");
    expect(screen.getByText("Shots: 1")).toBeDefined();
    expect(screen.getByText(/PW • 134.0 mph/)).toBeDefined();
  });
});
