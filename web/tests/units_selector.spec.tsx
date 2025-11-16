import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnitsSelector } from "@/components/UnitsSelector";
import { UnitsContext } from "@/preferences/UnitsContext";

function TestHarness() {
  const [unit, setUnit] = React.useState<"metric" | "imperial">("metric");
  return (
    <UnitsContext.Provider value={{ unit, setUnit }}>
      <UnitsSelector />
      <div data-testid="unit-value">{unit}</div>
    </UnitsContext.Provider>
  );
}

describe("UnitsSelector", () => {
  it("toggles between metric and imperial", async () => {
    render(<TestHarness />);
    const user = userEvent.setup();

    expect(screen.getByTestId("unit-value").textContent).toBe("metric");
    await user.click(screen.getByRole("button", { name: /yd/i }));
    expect(screen.getByTestId("unit-value").textContent).toBe("imperial");
    await user.click(screen.getByRole("button", { name: /^m$/i }));
    expect(screen.getByTestId("unit-value").textContent).toBe("metric");
  });
});
