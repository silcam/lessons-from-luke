/// <reference types="jest" />

/**
 * RED (task .4, red-team Pass 1 HIGH closure — Option A re-carry;
 * spec.md FR-010; plan.md "Update-issue suppression for changed numeric
 * references" HIGH + "Re-carry widens the upload side-effect" MEDIUM;
 * contracts/README.md "Update-path re-population (red-team Pass 1, HIGH)").
 *
 * Today `uploadEnglishDoc` only bumps the master's version via
 * `saveDocStrings` — it never re-applies auto-translation to any existing
 * project. When a master revision changes an auto-translatable numeric
 * reference (e.g. "1:5–25" → "1:5–24"), `addOrFindMasterStrings` creates a
 * brand-new master for the new text, and every existing project that had
 * the old numeric master translated is left with **no** translation for the
 * new master — silently blank, per the red-team finding. This test asserts
 * the closed-gap behavior (Option A: the upload path re-carries changed
 * auto-translatable numeric masters into existing projects, fill-only,
 * continue-on-error) and is confirmed failing against the current
 * `uploadEnglishDoc`, which performs no translation writes at all: the
 * "re-carried" assertions below fail because the new master is never
 * filled into any project (a `toMatchObject`/`toBeDefined` assertion
 * failure, not a compile error). Activated by task .5 (GREEN).
 */

import docStorage from "../storage/docStorage";
import * as updateLessonModule from "./updateLesson";
import * as referenceSplitterModule from "../xml/referenceSplitter";
import { uploadEnglishDoc } from "./uploadDocument";
import { Persistence } from "../../core/interfaces/Persistence";
import { Lesson, BaseLesson } from "../../core/models/Lesson";
import { LessonString, DraftLessonString } from "../../core/models/LessonString";
import { TString } from "../../core/models/TString";
import { ENGLISH_ID } from "../../core/models/Language";
import { DocString } from "../../core/models/DocString";
import { EnglishUploadMeta } from "../../core/models/DocUploadMeta";
import { UploadedFile } from "express-fileupload";

jest.mock("./updateLesson", () => ({
  ...jest.requireActual("./updateLesson"),
  parseDocStrings: jest.fn(),
}));

const LESSON_ID = 30;
const CHANGED_MASTER_ID = 500; // English master for the old "1:5–25" reference
const UNCHANGED_MASTER_ID = 501; // Unrelated master, manually translated

const FRENCH_ID = 2; // Existing project: has the old numeric reference auto-populated
const SPANISH_ID = 3; // Existing project: re-carry write fails for this one
const GERMAN_ID = 4; // Existing project: must still be re-carried despite Spanish's failure

/**
 * In-memory `Persistence` fixture supporting the subset of the interface
 * `uploadEnglishDoc` (today) plus the Option A re-carry (task .5, not yet
 * implemented) would exercise: lessons/lesson/updateLesson (upload),
 * tStrings/addOrFindMasterStrings/saveTStrings/languages (re-carry).
 */
function makeStorage(
  initialLesson: Lesson,
  initialEnglishStrings: TString[],
  initialOtherTStrings: Map<number, TString[]>,
  opts: { failLanguageId?: number } = {}
): Persistence {
  let nextMasterId = Math.max(0, ...initialEnglishStrings.map((ts) => ts.masterId)) + 1;
  let nextLessonStringId =
    Math.max(0, ...initialLesson.lessonStrings.map((ls) => ls.lessonStringId)) + 1;

  const englishStrings: TString[] = [...initialEnglishStrings];
  let lesson: Lesson = initialLesson;
  const otherLanguageTStrings = new Map<number, TString[]>(
    Array.from(initialOtherTStrings.entries()).map(([id, list]) => [id, [...list]])
  );

  return {
    languages: async () => [
      {
        languageId: FRENCH_ID,
        name: "Français",
        code: "FRA",
        motherTongue: false,
        progress: [],
        defaultSrcLang: ENGLISH_ID,
      },
      {
        languageId: SPANISH_ID,
        name: "Español",
        code: "SPA",
        motherTongue: false,
        progress: [],
        defaultSrcLang: ENGLISH_ID,
      },
      {
        languageId: GERMAN_ID,
        name: "Deutsch",
        code: "DEU",
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
    lessons: async () => [
      (({ lessonStrings: _ls, ...base }) => base)(lesson) as unknown as BaseLesson,
    ],
    lesson: async (id: number) => (id === lesson.lessonId ? lesson : null),
    oldLessonStrings: async () => [],
    createLesson: async () => {
      throw new Error("not implemented in fixture");
    },
    updateLesson: async (
      id: number,
      lessonVersion: number,
      draftLessonStrings: DraftLessonString[]
    ) => {
      if (id !== lesson.lessonId) throw new Error(`No such lesson id=${id}`);
      const newLessonStrings: LessonString[] = draftLessonStrings.map((ls) => ({
        ...ls,
        lessonStringId: nextLessonStringId++,
        lessonVersion,
      }));
      lesson = { ...lesson, version: lessonVersion, lessonStrings: newLessonStrings };
      return lesson;
    },
    tStrings: async (params: { languageId: number }) =>
      params.languageId === ENGLISH_ID
        ? englishStrings
        : (otherLanguageTStrings.get(params.languageId) ?? []),
    englishScriptureTStrings: async () => [],
    addOrFindMasterStrings: async (texts: string[]) =>
      texts.map((text) => {
        const found = englishStrings.find((ts) => ts.text === text);
        if (found) return found;
        const created: TString = {
          masterId: nextMasterId++,
          languageId: ENGLISH_ID,
          text,
          history: [],
        };
        englishStrings.push(created);
        return created;
      }),
    saveTStrings: async (tStrings: TString[]) => {
      for (const ts of tStrings) {
        if (ts.languageId === opts.failLanguageId) {
          throw new Error(`simulated re-carry failure for languageId=${ts.languageId}`);
        }
      }
      for (const ts of tStrings) {
        const existing = otherLanguageTStrings.get(ts.languageId) ?? [];
        otherLanguageTStrings.set(ts.languageId, [
          ...existing.filter((e) => e.masterId !== ts.masterId),
          ts,
        ]);
      }
      return tStrings;
    },
    sync: async () => {
      throw new Error("not implemented in fixture");
    },
  } as Persistence;
}

function baseLesson(overrides: Partial<BaseLesson> = {}): BaseLesson {
  return { lessonId: LESSON_ID, book: "Luke", series: 1, lesson: 3, version: 1, ...overrides };
}

describe("uploadEnglishDoc — Option A re-carry (red-team Pass 1 HIGH closure)", () => {
  beforeEach(() => {
    jest.spyOn(docStorage, "saveDoc").mockImplementation(async (_file, lsn) => {
      return `/fake/docs/${lsn.lessonId}-v${lsn.version}.odt`;
    });
    jest
      .spyOn(referenceSplitterModule, "splitReferencesInDocument")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("re-carries a corrected numeric reference into existing projects (fill-only), leaves unrelated manual translations untouched, and continues on a per-project failure", async () => {
    const initialLessonStrings: LessonString[] = [
      {
        lessonStringId: 1,
        masterId: CHANGED_MASTER_ID,
        lessonId: LESSON_ID,
        lessonVersion: 1,
        type: "content",
        xpath: "/p[1]",
        motherTongue: false,
      },
      {
        lessonStringId: 2,
        masterId: UNCHANGED_MASTER_ID,
        lessonId: LESSON_ID,
        lessonVersion: 1,
        type: "content",
        xpath: "/p[2]",
        motherTongue: false,
      },
    ];
    const lesson: Lesson = { ...baseLesson(), lessonStrings: initialLessonStrings };

    const englishStrings: TString[] = [
      { masterId: CHANGED_MASTER_ID, languageId: ENGLISH_ID, text: "1:5–25", history: [] },
      {
        masterId: UNCHANGED_MASTER_ID,
        languageId: ENGLISH_ID,
        text: "Jesus taught the crowd.",
        history: [],
      },
    ];

    // French: already has the old numeric reference auto-populated (this is
    // what would go stale/silently-blank once the master text changes), plus
    // a manual (non-auto) translation for the unrelated master.
    const frenchInitial: TString[] = [
      {
        masterId: CHANGED_MASTER_ID,
        languageId: FRENCH_ID,
        text: "1:5–25",
        source: "1:5–25",
        sourceLanguageId: ENGLISH_ID,
        history: [],
      },
      {
        masterId: UNCHANGED_MASTER_ID,
        languageId: FRENCH_ID,
        text: "Jésus a enseigné à la foule.",
        history: [],
      },
    ];
    // Spanish: blank project for both masters; its re-carry write will be
    // made to throw below (continue-on-error case).
    const spanishInitial: TString[] = [];
    // German: blank project for both masters; must still be re-carried
    // despite Spanish's simulated failure.
    const germanInitial: TString[] = [];

    const storage = makeStorage(
      lesson,
      englishStrings,
      new Map([
        [FRENCH_ID, frenchInitial],
        [SPANISH_ID, spanishInitial],
        [GERMAN_ID, germanInitial],
      ]),
      { failLanguageId: SPANISH_ID }
    );

    // The revised master document: the numeric reference has changed from
    // "1:5–25" to "1:5–24" at the same xpath; the unrelated string is
    // unchanged.
    const revisedDocStrings: DocString[] = [
      { type: "content", xpath: "/p[1]", motherTongue: false, text: "1:5–24" },
      { type: "content", xpath: "/p[2]", motherTongue: false, text: "Jesus taught the crowd." },
    ];
    (updateLessonModule.parseDocStrings as jest.Mock).mockReturnValue(revisedDocStrings);

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    const meta: EnglishUploadMeta = { languageId: ENGLISH_ID, book: "Luke", series: 1, lesson: 3 };
    const file = {} as UploadedFile;

    // The upload itself must succeed (per-project failure logged, not thrown)
    // even though the Spanish re-carry write is made to fail below.
    await expect(uploadEnglishDoc(file, meta, storage)).resolves.toBeDefined();

    const currentEnglishStrings = await storage.tStrings({ languageId: ENGLISH_ID });
    const newMaster = currentEnglishStrings.find((ts) => ts.text === "1:5–24");
    expect(newMaster).toBeDefined();

    // French (already had the stale reference translated) is re-carried:
    // the new numeric master is auto-populated, fill-only, sourced from
    // English.
    const frenchStrings = await storage.tStrings({ languageId: FRENCH_ID });
    const frenchNewMaster = frenchStrings.find((ts) => ts.masterId === newMaster?.masterId);
    expect(frenchNewMaster).toMatchObject({
      text: "1:5–24",
      source: "1:5–24",
      sourceLanguageId: ENGLISH_ID,
    });

    // French's pre-existing manual translation for the unrelated master is
    // completely untouched (fill-only semantics never overwrite).
    const frenchUnchanged = frenchStrings.find((ts) => ts.masterId === UNCHANGED_MASTER_ID);
    expect(frenchUnchanged).toMatchObject({ text: "Jésus a enseigné à la foule." });

    // German (a different, previously-blank project) is still re-carried
    // despite Spanish's simulated failure elsewhere in the same batch —
    // proving continue-on-error rather than all-or-nothing.
    const germanStrings = await storage.tStrings({ languageId: GERMAN_ID });
    const germanNewMaster = germanStrings.find((ts) => ts.masterId === newMaster?.masterId);
    expect(germanNewMaster).toMatchObject({
      text: "1:5–24",
      source: "1:5–24",
      sourceLanguageId: ENGLISH_ID,
    });

    // Spanish's re-carry write was made to throw — it must still show no
    // translation for the new master (the failure did not half-apply), and
    // the failure must be logged per-project (success/skip/failure
    // discipline, matching reparseEnglish's batch logging).
    const spanishStrings = await storage.tStrings({ languageId: SPANISH_ID });
    expect(spanishStrings.find((ts) => ts.masterId === newMaster?.masterId)).toBeUndefined();

    const loggedMessages = logSpy.mock.calls.map((args) => args.join(" "));
    expect(
      loggedMessages.some((msg) => msg.includes(String(SPANISH_ID)) && /fail|error|skip/i.test(msg))
    ).toBe(true);
  });
});
