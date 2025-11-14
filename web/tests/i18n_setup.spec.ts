import { describe, expect, it } from "vitest";
import i18n from "../src/i18n";

describe("i18n setup", () => {
  it("returns translations for known keys", () => {
    expect(i18n.t("nav.playRound")).toBe("Play round");
  });

  it("can switch to English without errors", async () => {
    await expect(i18n.changeLanguage("en")).resolves.toBeTruthy();
  });
});
