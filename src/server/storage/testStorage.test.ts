/// <reference types="jest" />

/**
 * Tests for the in-memory testStorage implementation.
 * This covers branches that storage.test.ts misses because it runs against PGTestStorage.
 */
import storage from "./testStorage";
import { ENGLISH_ID } from "../../core/models/Language";

beforeEach(async () => {
  await storage.reset();
});

describe("language", () => {
  test("finds language by languageId", async () => {
    const lang = await storage.language({ languageId: 1 });
    expect(lang).not.toBeNull();
    expect(lang!.languageId).toBe(1);
  });

  test("finds language by code", async () => {
    const langs = await storage.languages();
    const code = langs[0].code;
    const lang = await storage.language({ code });
    expect(lang).not.toBeNull();
    expect(lang!.code).toBe(code);
  });

  test("returns null when languageId not found", async () => {
    const lang = await storage.language({ languageId: 9999 });
    expect(lang).toBeNull();
  });

  test("returns null when code not found", async () => {
    const lang = await storage.language({ code: "ZZZZZ" });
    expect(lang).toBeNull();
  });
});

describe("invalidCode", () => {
  test("returns true when code does not match any language", async () => {
    const result = await storage.invalidCode("NONEXISTENT", [1]);
    expect(result).toBe(true);
  });

  test("returns false when code matches language and languageId is valid", async () => {
    const langs = await storage.languages();
    const { code, languageId } = langs[0];
    const result = await storage.invalidCode(code, [languageId]);
    expect(result).toBe(false);
  });

  test("returns true when code matches but languageId does not match", async () => {
    const langs = await storage.languages();
    const { code } = langs[0];
    const result = await storage.invalidCode(code, [9999]);
    expect(result).toBe(true);
  });
});

describe("lesson", () => {
  test("returns lesson with lessonStrings when found", async () => {
    const lesson = await storage.lesson(11);
    expect(lesson).not.toBeNull();
    expect(lesson!.lessonId).toBe(11);
    expect(Array.isArray(lesson!.lessonStrings)).toBe(true);
  });

  test("returns null when lesson not found", async () => {
    const lesson = await storage.lesson(99999);
    expect(lesson).toBeNull();
  });
});

describe("tStrings", () => {
  test("returns all tStrings for a language when no lessonId", async () => {
    const tStrings = await storage.tStrings({ languageId: 1 });
    expect(tStrings.length).toBeGreaterThan(0);
    expect(tStrings.every(ts => ts.languageId === 1)).toBe(true);
  });

  test("returns filtered tStrings when lessonId provided", async () => {
    const tStrings = await storage.tStrings({ languageId: 3, lessonId: 11 });
    expect(tStrings.every(ts => ts.languageId === 3)).toBe(true);
  });

  test("returns empty array when no tStrings for language", async () => {
    const tStrings = await storage.tStrings({ languageId: 9999 });
    expect(tStrings).toEqual([]);
  });
});

describe("saveTStrings", () => {
  test("adds a new tString", async () => {
    const newTStr = {
      masterId: 1,
      languageId: 99,
      text: "New translation",
      history: []
    };
    const result = await storage.saveTStrings([newTStr]);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("New translation");
  });

  test("updates existing tString and records history when text changes", async () => {
    const existingStrings = await storage.tStrings({ languageId: 3 });
    const existing = existingStrings[0];
    const originalText = existing.text;

    const updated = { ...existing, text: "Updated text" };
    const result = await storage.saveTStrings([updated]);
    expect(result[0].history).toContain(originalText);
    expect(result[0].text).toBe("Updated text");
  });

  test("does not update history when text is the same", async () => {
    const existingStrings = await storage.tStrings({ languageId: 3 });
    const existing = existingStrings[0];
    const originalHistory = [...existing.history];

    const unchanged = { ...existing };
    const result = await storage.saveTStrings([unchanged]);
    expect(result[0].history).toEqual(originalHistory);
  });

  test("removes tString and returns empty array when text is empty", async () => {
    const existingStrings = await storage.tStrings({ languageId: 3 });
    const existing = existingStrings[0];

    const empty = { ...existing, text: "" };
    const result = await storage.saveTStrings([empty]);
    expect(result).toHaveLength(0);
  });
});

describe("addOrFindMasterStrings", () => {
  test("returns existing master string when text matches", async () => {
    const result = await storage.addOrFindMasterStrings(["Le livre de Luc et la naissance de Jean Baptiste"]);
    expect(result.length).toBe(1);
    expect(result[0].languageId).toBe(ENGLISH_ID);
  });

  test("creates new master string when text not found", async () => {
    const newText = "Brand new unique string " + Date.now();
    const result = await storage.addOrFindMasterStrings([newText]);
    expect(result.length).toBe(1);
    expect(result[0].text).toBe(newText);
    expect(result[0].languageId).toBe(ENGLISH_ID);
  });
});

describe("createLanguage and updateLanguage", () => {
  test("createLanguage adds a new language with unique code", async () => {
    const newLang = await storage.createLanguage({ name: "Klingon", defaultSrcLang: 1 });
    const after = await storage.languages();
    expect(after.find(l => l.name === "Klingon")).toBeTruthy();
    expect(newLang.name).toBe("Klingon");
    expect(newLang.code).toBeTruthy();
  });

  test("updateLanguage modifies an existing language", async () => {
    const updated = await storage.updateLanguage(1, { name: "American English" });
    expect(updated.name).toBe("American English");
  });
});
