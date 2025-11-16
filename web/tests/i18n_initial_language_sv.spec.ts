import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("i18n initial language", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to Swedish when the browser language is sv", async () => {
    const mockWindow = {
      localStorage: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
      },
      navigator: {
        language: "sv-SE",
        languages: ["sv-SE", "en-US"],
      },
    } as unknown as Window & typeof globalThis;

    vi.stubGlobal("window", mockWindow);
    vi.stubGlobal("navigator", mockWindow.navigator);

    const { default: freshI18n } = await import("../src/i18n");

    expect(freshI18n.language.startsWith("sv")).toBe(true);

    await freshI18n.changeLanguage("en");
  });
});
