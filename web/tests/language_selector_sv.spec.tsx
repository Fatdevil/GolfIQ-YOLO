import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LanguageSelector } from "@/components/LanguageSelector";

describe("LanguageSelector", () => {
  it("shows both English and Swedish options", () => {
    render(<LanguageSelector />);

    expect(screen.getByRole("option", { name: "English" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Svenska" })).toBeTruthy();
  });
});
