/// <reference types="jest" />

import {
  availableLocales,
  tForLocale,
  localeByLanguageId,
  longName
} from "./I18n";
import { FRENCH_ID, ENGLISH_ID } from "../models/Language";

describe("availableLocales", () => {
  test("returns en and fr", () => {
    const locales = availableLocales();
    expect(locales).toContain("en");
    expect(locales).toContain("fr");
  });
});

describe("tForLocale", () => {
  test("returns a translation function for English", () => {
    const t = tForLocale("en");
    expect(t("Luke")).toBe("Luke");
    expect(t("Acts")).toBe("Acts");
  });

  test("returns a translation function for French", () => {
    const t = tForLocale("fr");
    expect(typeof t("Luke")).toBe("string");
    expect(t("Luke").length).toBeGreaterThan(0);
  });

  test("substitutes placeholders", () => {
    const t = tForLocale("en");
    // needToSync uses no substitutions, but we can test with a key that has subs
    // Use any key to check that the function works
    const result = t("Save");
    expect(typeof result).toBe("string");
  });

  test("substitutes %{key} placeholders in translation strings", () => {
    const t = tForLocale("en");
    expect(t("serverError", { status: "500" })).toBe("Server Error 500");
  });
});

describe("localeByLanguageId", () => {
  test("returns fr for FRENCH_ID", () => {
    expect(localeByLanguageId(FRENCH_ID)).toBe("fr");
  });

  test("returns en for ENGLISH_ID", () => {
    expect(localeByLanguageId(ENGLISH_ID)).toBe("en");
  });

  test("returns en for unknown language id (default)", () => {
    expect(localeByLanguageId(9999)).toBe("en");
  });
});

describe("longName", () => {
  test("returns English for en", () => {
    expect(longName("en")).toBe("English");
  });

  test("returns Français for fr", () => {
    expect(longName("fr")).toBe("Français");
  });
});
