/// <reference types="jest" />

/**
 * US4 acceptance scenario binding (specs/acceptance-specs/US19-backfill-existing-projects.txt)
 * for the "backfill" script (spec.md FR-011, FR-015).
 *
 * `defaultTranslateAll` is a manually-run maintenance script. It has been
 * refactored (this task) to accept an injected `Persistence` so it can be
 * exercised in-process with an in-memory fixture instead of a real
 * PGStorage/Postgres connection — a behavior-preserving extraction only
 * (the top-level `require.main` auto-invoke still constructs a real
 * `PGStorage()` by default, unchanged).
 *
 * GWT scenario bound here:
 *   "Backfill fills only missing numeric references without overwriting
 *   existing work" — GIVEN an existing project with a mix of translated and
 *   untranslated references, WHEN the operator runs the backfill, THEN every
 *   missing numeric reference string is filled from English and THEN every
 *   string that already has a translation is left unchanged.
 *
 * The remaining four US19 GWT scenarios (re-processing splits residual
 * references, re-processing surfaces a changed reference via
 * lesson-update-issues, the re-processing-then-backfill operational
 * sequence, and the Option A "corrected reference does not go silently
 * blank" red-team closure) are bound in reparseEnglish.test.ts.
 */

import { defaultTranslateAll } from "./defaultTranslateAll";
import { Persistence } from "../../core/interfaces/Persistence";
import { ENGLISH_ID } from "../../core/models/Language";
import { TString } from "../../core/models/TString";

const EXISTING_LANGUAGE_ID = 2;

const ALREADY_TRANSLATED_MASTER_ID = 201; // numeric reference, already has a (manual) translation
const MISSING_MASTER_ID = 202; // numeric reference, no translation yet in the existing project
const BOOK_NAME_MASTER_ID = 203; // prose (never auto-translatable), left blank on purpose

function makeStorage(): Persistence {
  const store = new Map<number, TString[]>();
  store.set(ENGLISH_ID, [
    { masterId: ALREADY_TRANSLATED_MASTER_ID, languageId: ENGLISH_ID, text: "1:5–25", history: [] },
    { masterId: MISSING_MASTER_ID, languageId: ENGLISH_ID, text: "18:35–19:10", history: [] },
    { masterId: BOOK_NAME_MASTER_ID, languageId: ENGLISH_ID, text: "Luke", history: [] },
  ]);
  // The existing project already has a manual translation for the
  // already-translated numeric reference master, and nothing else.
  store.set(EXISTING_LANGUAGE_ID, [
    {
      masterId: ALREADY_TRANSLATED_MASTER_ID,
      languageId: EXISTING_LANGUAGE_ID,
      text: "1:5-25 (translator-adjusted punctuation)",
      history: ["1:5–25"],
    },
  ]);

  return {
    languages: async () => [
      {
        languageId: EXISTING_LANGUAGE_ID,
        name: "Français",
        code: "FRA",
        motherTongue: false,
        progress: [],
        defaultSrcLang: ENGLISH_ID,
      },
    ],
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

describe("defaultTranslateAll — US19 backfill scenario", () => {
  it("fills only the missing numeric reference and leaves the existing translation untouched", async () => {
    const storage = makeStorage();

    await defaultTranslateAll(storage);

    const existingLanguageStrings = await storage.tStrings({ languageId: EXISTING_LANGUAGE_ID });

    // Missing numeric reference: filled from English.
    const filled = existingLanguageStrings.find((ts) => ts.masterId === MISSING_MASTER_ID);
    expect(filled).toMatchObject({
      text: "18:35–19:10",
      source: "18:35–19:10",
      sourceLanguageId: ENGLISH_ID,
    });

    // Already-translated numeric reference: left completely unchanged
    // (never overwritten by the backfill).
    const untouched = existingLanguageStrings.find(
      (ts) => ts.masterId === ALREADY_TRANSLATED_MASTER_ID
    );
    expect(untouched).toMatchObject({
      text: "1:5-25 (translator-adjusted punctuation)",
      history: ["1:5–25"],
    });

    // Prose (book name) master: never auto-translatable, stays blank/missing.
    const proseString = existingLanguageStrings.find((ts) => ts.masterId === BOOK_NAME_MASTER_ID);
    expect(proseString).toBeUndefined();
  });
});
