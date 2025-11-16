import React from "react";
import { describe, expect, it, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { UnitsProvider, useUnits } from "@/preferences/UnitsContext";

describe("UnitsProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to metric when locale is not explicitly imperial", () => {
    const originalLanguage = window.navigator.language;
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      get: () => "fr-FR",
    });

    const { result } = renderHook(() => useUnits(), { wrapper: UnitsProvider });
    expect(result.current.unit).toBe("metric");

    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      get: () => originalLanguage,
    });
  });

  it("defaults to imperial for en-US navigator language", () => {
    const originalLanguage = window.navigator.language;
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      get: () => "en-US",
    });
    window.localStorage.clear();

    const { result } = renderHook(() => useUnits(), { wrapper: UnitsProvider });
    expect(result.current.unit).toBe("imperial");

    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      get: () => originalLanguage,
    });
  });
});
