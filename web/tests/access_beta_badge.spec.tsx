import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { BetaBadge } from "@/access/BetaBadge";

describe("BetaBadge", () => {
  it("renders Beta badge", () => {
    render(<BetaBadge />);
    expect(screen.getByText(/Beta/i)).toBeTruthy();
  });
});
