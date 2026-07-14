import defaultTranslations, { canAutoTranslate } from "./defaultTranslations";
import { Persistence } from "../../core/interfaces/Persistence";
import { ENGLISH_ID } from "../../core/models/Language";
import { TString } from "../../core/models/TString";

describe("canAutoTranslate", () => {
  describe("numeric verse-reference shapes", () => {
    it("matches a single-chapter verse range with an en-dash", () => {
      expect(canAutoTranslate("1:5–25")).toBe(true);
    });

    it("matches a single-chapter verse range with a hyphen", () => {
      expect(canAutoTranslate("1:5-25")).toBe(true);
    });

    it("matches a cross-chapter verse range", () => {
      expect(canAutoTranslate("18:35–19:10")).toBe(true);
    });

    it("matches a verse range with leading/trailing whitespace (trimmed before match)", () => {
      expect(canAutoTranslate(" 1:5–25 ")).toBe(true);
    });
  });

  describe("existing digit-only behavior (no regression)", () => {
    it("still matches a bare lesson number", () => {
      expect(canAutoTranslate("3")).toBe(true);
    });

    it("still matches a bare lesson number", () => {
      expect(canAutoTranslate("5")).toBe(true);
    });
  });

  describe("non-matching prose and malformed shapes", () => {
    it("never matches a bare word", () => {
      expect(canAutoTranslate("Luke")).toBe(false);
    });

    it("never matches prose containing a reference-like substring", () => {
      expect(canAutoTranslate("Bible Story: Luke 10:25–37")).toBe(false);
    });

    it("does not match a shape with no range separator", () => {
      expect(canAutoTranslate("3:00")).toBe(false);
    });
  });
});

/**
 * US16 acceptance scenarios (specs/acceptance-specs/US16-verse-references-prefill.txt)
 * bound at the `defaultTranslations` integration level via an in-memory
 * Persistence fixture. Each `it` below is tagged with the GWT scenario it
 * exercises.
 *
 * Fixture design: `tStrings({ languageId })` and `saveTStrings` share a
 * single in-memory `store` keyed by languageId, seeded with English masters
 * under `ENGLISH_ID`. This lets scenario 3 simulate a translator saving a
 * tString (via `saveTStrings`, exactly like the real save-translation path)
 * and then read back the target language's strings to confirm the numeric
 * masters were unaffected — demonstrating that translate-once propagation
 * for the book name is a structural consequence of the single shared
 * master, not something `defaultTranslations` itself needs to implement.
 */
describe("defaultTranslations — US16 acceptance scenarios", () => {
  const BOOK_NAME_MASTER_ID = 100;
  const EN_DASH_RANGE_MASTER_ID = 101;
  const HYPHEN_RANGE_MASTER_ID = 102;
  const WHITESPACE_RANGE_MASTER_ID = 103;

  function makeStorage(): Persistence {
    const store = new Map<number, TString[]>();
    store.set(ENGLISH_ID, [
      { masterId: BOOK_NAME_MASTER_ID, languageId: ENGLISH_ID, text: "Luke", history: [] },
      {
        masterId: EN_DASH_RANGE_MASTER_ID,
        languageId: ENGLISH_ID,
        text: "1:5–25",
        history: [],
      },
      {
        masterId: HYPHEN_RANGE_MASTER_ID,
        languageId: ENGLISH_ID,
        text: "1:5-25",
        history: [],
      },
      {
        masterId: WHITESPACE_RANGE_MASTER_ID,
        languageId: ENGLISH_ID,
        text: " 1:5–25 ",
        history: [],
      },
    ]);

    return {
      languages: async () => [],
      language: async () => null,
      createLanguage: async () => {
        throw new Error("not implemented in fixture");
      },
      updateLanguage: async () => {
        throw new Error("not implemented in fixture");
      },
      invalidCode: async () => false,
      lessons: async () => [],
      lesson: async () => null,
      oldLessonStrings: async () => [],
      createLesson: async () => {
        throw new Error("not implemented in fixture");
      },
      updateLesson: async () => {
        throw new Error("not implemented in fixture");
      },
      tStrings: async (params: { languageId: number }) => store.get(params.languageId) ?? [],
      englishScriptureTStrings: async () => [],
      addOrFindMasterStrings: async () => [],
      saveTStrings: async (tStrings: TString[]) => {
        for (const ts of tStrings) {
          const existing = store.get(ts.languageId) ?? [];
          const withoutThisMaster = existing.filter((e) => e.masterId !== ts.masterId);
          store.set(ts.languageId, [...withoutThisMaster, ts]);
        }
        return tStrings;
      },
      sync: async () => {
        throw new Error("not implemented in fixture");
      },
    } as Persistence;
  }

  const NEW_LANGUAGE_ID = 2;

  // GWT scenario 1: numeric references auto-populate on project creation;
  // book-name strings remain empty and translatable.
  it("auto-populates the numeric reference master but not the book-name master", async () => {
    const storage = makeStorage();

    await defaultTranslations(storage, NEW_LANGUAGE_ID);

    const newLanguageStrings = await storage.tStrings({ languageId: NEW_LANGUAGE_ID });
    const rangeString = newLanguageStrings.find((ts) => ts.masterId === EN_DASH_RANGE_MASTER_ID);
    expect(rangeString).toMatchObject({
      masterId: EN_DASH_RANGE_MASTER_ID,
      text: "1:5–25",
      source: "1:5–25",
      sourceLanguageId: ENGLISH_ID,
    });

    const bookNameString = newLanguageStrings.find((ts) => ts.masterId === BOOK_NAME_MASTER_ID);
    expect(bookNameString).toBeUndefined();
  });

  // GWT scenario 2: recognition tolerates dash-character and whitespace
  // variants — both the hyphen variant and the en-dash variant are accepted.
  it("auto-populates a hyphen-variant and a whitespace-variant numeric reference", async () => {
    const storage = makeStorage();

    await defaultTranslations(storage, NEW_LANGUAGE_ID);

    const newLanguageStrings = await storage.tStrings({ languageId: NEW_LANGUAGE_ID });

    const hyphenString = newLanguageStrings.find((ts) => ts.masterId === HYPHEN_RANGE_MASTER_ID);
    expect(hyphenString).toMatchObject({
      text: "1:5-25",
      source: "1:5-25",
      sourceLanguageId: ENGLISH_ID,
    });

    const whitespaceString = newLanguageStrings.find(
      (ts) => ts.masterId === WHITESPACE_RANGE_MASTER_ID
    );
    expect(whitespaceString).toMatchObject({
      text: " 1:5–25 ",
      source: " 1:5–25 ",
      sourceLanguageId: ENGLISH_ID,
    });
  });

  // GWT scenario 3: translating the book name once completes every
  // reference — demonstrated structurally: saving a translation for the
  // book-name master must not disturb the already-auto-populated numeric
  // masters (they share no code path with the book-name save).
  it("does not disturb already-auto-populated numeric masters when the book name is translated", async () => {
    const storage = makeStorage();
    await defaultTranslations(storage, NEW_LANGUAGE_ID);

    // Simulate the translator saving a translation for the book-name master.
    await storage.saveTStrings([
      { masterId: BOOK_NAME_MASTER_ID, languageId: NEW_LANGUAGE_ID, text: "Lucas", history: [] },
    ]);

    const newLanguageStrings = await storage.tStrings({ languageId: NEW_LANGUAGE_ID });

    const bookNameString = newLanguageStrings.find((ts) => ts.masterId === BOOK_NAME_MASTER_ID);
    expect(bookNameString).toMatchObject({ text: "Lucas" });

    const rangeString = newLanguageStrings.find((ts) => ts.masterId === EN_DASH_RANGE_MASTER_ID);
    expect(rangeString).toMatchObject({
      text: "1:5–25",
      source: "1:5–25",
      sourceLanguageId: ENGLISH_ID,
    });
  });

  // GWT scenario 4: auto-populated references are ordinary editable
  // translations — same provenance/history shape as any auto-translated
  // string, not locked, not a special string type.
  it("gives the auto-populated tString ordinary shape: empty history, no lock/special-type field", async () => {
    const storage = makeStorage();

    await defaultTranslations(storage, NEW_LANGUAGE_ID);

    const newLanguageStrings = await storage.tStrings({ languageId: NEW_LANGUAGE_ID });
    const rangeString = newLanguageStrings.find((ts) => ts.masterId === EN_DASH_RANGE_MASTER_ID);

    expect(rangeString).toBeDefined();
    expect(rangeString?.history).toEqual([]);
    expect(Object.keys(rangeString ?? {}).sort()).toEqual(
      ["history", "languageId", "masterId", "source", "sourceLanguageId", "text"].sort()
    );
  });
});
