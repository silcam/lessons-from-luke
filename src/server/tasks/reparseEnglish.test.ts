/// <reference types="jest" />

/**
 * US4 acceptance scenario binding (specs/acceptance-specs/US19-backfill-existing-projects.txt)
 * for the "re-processing" script (spec.md FR-010, FR-012, FR-013, FR-015)
 * and the operational sequence FR-013 requires.
 *
 * `reparseEnglish`/`reparseLesson` have been refactored (this task) to
 * accept an injected `Persistence` and to guard the top-level auto-invoke
 * behind `require.main === module` — a behavior-preserving extraction only,
 * needed so these scripts can be exercised in-process instead of only as a
 * manually-run CLI script against a real PGStorage/Postgres connection and
 * real ODT files on disk. `docStorage.docFilepath`/`fs.copyFileSync` and
 * `parseDocStrings` are mocked below so no real file I/O happens; the
 * lesson-persistence side (`addOrFindMasterStrings`, `updateLesson`,
 * `tStrings`, `saveTStrings`) runs against a real in-memory `Persistence`
 * fixture (same pattern as defaultTranslations.test.ts /
 * defaultTranslateAll.test.ts) so the interaction between re-processing and
 * backfill is genuinely exercised, not mocked away.
 *
 * Five GWT scenarios in the acceptance spec, in file order:
 *
 *  1. "One-time re-processing splits residual references in every stored
 *     master" — depends on the Mechanism-2 splitter being wired into
 *     reparseLesson (spec.md FR-012), which is US4 task .3 (GREEN, not yet
 *     implemented at this WRITE_ACCEPTANCE_TEST stage). Bound but skipped
 *     below; see the RED test in task .2 for the splitter-integration
 *     assertion itself.
 *  2. "Backfill fills only missing numeric references without overwriting
 *     existing work" — bound and passing in defaultTranslateAll.test.ts.
 *  3. "Re-processing surfaces a changed reference through the
 *     lesson-update-issues flow" — also depends on the splitter (task .3);
 *     the underlying findTSubs behavior for a combined "Luke 1:26–38"
 *     master splitting into "Luke" + "1:26–38" is already covered at the
 *     unit level in findTSubs.test.ts ("still surfaces an update-issue when
 *     a combined verse reference with letters... is split into separate
 *     masters"). Bound but skipped here at the reparseLesson-integration
 *     altitude until task .3 wires the splitter call in.
 *  4. "The operational sequence runs re-processing first and backfill
 *     second" — bound and passing below: reparsing a lesson can introduce a
 *     new English master that only exists once re-processing has run: the
 *     subsequent backfill can only fill it into existing projects because
 *     it ran second.
 *  5. "A numeric reference corrected in an existing master does not go
 *     silently blank" (Option A re-carry, red-team Pass 1 HIGH closure) —
 *     depends on task .5 (GREEN: Option A re-carry in `uploadEnglishDoc`).
 *     Bound but skipped below; task .4 (RED) owns the focused failing test
 *     against `uploadEnglishDoc` directly.
 */

import fs from "fs";
import docStorage from "../storage/docStorage";
import * as updateLessonModule from "../actions/updateLesson";
import * as referenceSplitterModule from "../xml/referenceSplitter";
import { reparseLesson, reparseEnglish } from "./reparseEnglish";
import { defaultTranslateAll } from "./defaultTranslateAll";
import { Persistence } from "../../core/interfaces/Persistence";
import { Lesson, BaseLesson } from "../../core/models/Lesson";
import { LessonString, DraftLessonString } from "../../core/models/LessonString";
import { TString } from "../../core/models/TString";
import { ENGLISH_ID } from "../../core/models/Language";
import { DocString } from "../../core/models/DocString";

jest.mock("../actions/updateLesson", () => ({
  ...jest.requireActual("../actions/updateLesson"),
  parseDocStrings: jest.fn(),
}));

const EXISTING_LANGUAGE_ID = 2;
const LESSON_ID = 11;

/**
 * In-memory `Persistence` fixture supporting the subset of the interface
 * `reparseLesson` + `defaultTranslateAll` actually exercise:
 * lessons/lesson/updateLesson/oldLessonStrings (re-processing) and
 * tStrings/addOrFindMasterStrings/saveTStrings/languages (backfill).
 */
function makeStorage(initialLesson: Lesson, initialEnglishStrings: TString[]): Persistence {
  let nextMasterId = Math.max(0, ...initialEnglishStrings.map((ts) => ts.masterId)) + 1;
  let nextLessonStringId =
    Math.max(0, ...initialLesson.lessonStrings.map((ls) => ls.lessonStringId)) + 1;

  const englishStrings: TString[] = [...initialEnglishStrings];
  const lessons = new Map<number, Lesson>([[initialLesson.lessonId, initialLesson]]);
  const oldLessonStringsByKey = new Map<string, LessonString[]>();
  const otherLanguageTStrings = new Map<number, TString[]>();

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
    lessons: async () =>
      Array.from(lessons.values()).map(({ lessonStrings: _ls, ...base }) => base),
    lesson: async (id: number) => lessons.get(id) ?? null,
    oldLessonStrings: async (lessonId: number, version?: number) =>
      oldLessonStringsByKey.get(`${lessonId}:${version}`) ?? [],
    createLesson: async () => {
      throw new Error("not implemented in fixture");
    },
    updateLesson: async (
      id: number,
      lessonVersion: number,
      draftLessonStrings: DraftLessonString[]
    ) => {
      const lesson = lessons.get(id);
      if (!lesson) throw new Error(`No such lesson id=${id}`);
      oldLessonStringsByKey.set(`${id}:${lesson.version}`, lesson.lessonStrings);
      const newLessonStrings: LessonString[] = draftLessonStrings.map((ls) => ({
        ...ls,
        lessonStringId: nextLessonStringId++,
        lessonVersion,
      }));
      const updated: Lesson = {
        ...lesson,
        version: lessonVersion,
        lessonStrings: newLessonStrings,
      };
      lessons.set(id, updated);
      return updated;
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
  return { lessonId: LESSON_ID, book: "Luke", series: 1, lesson: 1, version: 1, ...overrides };
}

describe("reparseEnglish/reparseLesson — US19 scenarios", () => {
  beforeEach(() => {
    jest
      .spyOn(docStorage, "docFilepath")
      .mockImplementation(
        (lesson: BaseLesson) => `/fake/docs/${lesson.lessonId}-v${lesson.version}.odt`
      );
    jest.spyOn(fs, "copyFileSync").mockImplementation(() => undefined);
    // Default no-op: individual tests below re-spy with their own
    // mockImplementation to assert call order/failure behavior.
    jest
      .spyOn(referenceSplitterModule, "splitReferencesInDocument")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // GWT scenario 4 (operational sequence): re-processing MUST run before
  // backfill, because re-processing is what can introduce the new English
  // master that backfill then fills into existing projects. Running
  // backfill first would have nothing new to fill.
  it("running reparseLesson then defaultTranslateAll fills the newly-introduced numeric reference without disturbing prior translations", async () => {
    const UNCHANGED_MASTER_ID = 502;

    const initialLessonStrings: LessonString[] = [
      {
        lessonStringId: 1,
        masterId: UNCHANGED_MASTER_ID,
        lessonId: LESSON_ID,
        lessonVersion: 1,
        type: "content",
        xpath: "/p[1]",
        motherTongue: false,
      },
    ];
    const lesson: Lesson = { ...baseLesson(), lessonStrings: initialLessonStrings };
    const englishStrings: TString[] = [
      {
        masterId: UNCHANGED_MASTER_ID,
        languageId: ENGLISH_ID,
        text: "God hears our prayers.",
        history: [],
      },
    ];
    const storage = makeStorage(lesson, englishStrings);

    // The existing (French) project already has a manual translation for
    // the unrelated master — this must never be touched by either step.
    await storage.saveTStrings([
      {
        masterId: UNCHANGED_MASTER_ID,
        languageId: EXISTING_LANGUAGE_ID,
        text: "Dieu entend nos prières.",
        history: [],
      },
    ]);

    // Re-processing re-parses the doc and discovers a residual reference
    // that is now a brand-new English master (not previously stored).
    const newDocStrings: DocString[] = [
      { type: "content", xpath: "/p[1]", motherTongue: false, text: "God hears our prayers." },
      { type: "content", xpath: "/p[2]", motherTongue: false, text: "18:35–19:10" },
    ];
    (updateLessonModule.parseDocStrings as jest.Mock).mockReturnValue(newDocStrings);

    // Step 1: re-processing runs first.
    await reparseLesson(lesson, storage);

    // Step 2: backfill runs second.
    await defaultTranslateAll(storage);

    const frenchStrings = await storage.tStrings({ languageId: EXISTING_LANGUAGE_ID });

    // The new numeric reference master exists only because re-processing
    // ran first, and is now filled because backfill ran second.
    const currentEnglishStrings = await storage.tStrings({ languageId: ENGLISH_ID });
    const newMaster = currentEnglishStrings.find((ts) => ts.text === "18:35–19:10");
    expect(newMaster).toBeDefined();
    const filled = frenchStrings.find((ts) => ts.masterId === newMaster?.masterId);
    expect(filled).toMatchObject({
      text: "18:35–19:10",
      source: "18:35–19:10",
      sourceLanguageId: ENGLISH_ID,
    });

    // The pre-existing manual translation for the unrelated master is
    // completely untouched by either step.
    const untouched = frenchStrings.find((ts) => ts.masterId === UNCHANGED_MASTER_ID);
    expect(untouched).toMatchObject({ text: "Dieu entend nos prières." });
  });

  // RED (task .2): reparseLesson MUST invoke the Mechanism-2 splitter
  // (src/server/xml/referenceSplitter.ts) on the copied master file BEFORE
  // calling parseDocStrings (spec.md FR-012). Confirmed failing against the
  // current reparseEnglish.ts, which goes straight from fs.copyFileSync to
  // parseDocStrings with no splitter call — the call-order spy below never
  // observes the splitter call, so this fails with "Number of calls: 0" (an
  // assertion error, not a compile error). Activated by task .3 (GREEN).
  it("invokes the Mechanism-2 splitter on the copied master before parseDocStrings", async () => {
    const lesson: Lesson = {
      ...baseLesson(),
      lessonStrings: [
        {
          lessonStringId: 1,
          masterId: 900,
          lessonId: LESSON_ID,
          lessonVersion: 1,
          type: "content",
          xpath: "/p[1]",
          motherTongue: false,
        },
      ],
    };
    const englishStrings: TString[] = [
      { masterId: 900, languageId: ENGLISH_ID, text: "Luke 1:26–38", history: [] },
    ];
    const storage = makeStorage(lesson, englishStrings);

    const callOrder: string[] = [];
    const splitSpy = jest
      .spyOn(referenceSplitterModule, "splitReferencesInDocument")
      .mockImplementation(() => {
        callOrder.push("split");
      });
    (updateLessonModule.parseDocStrings as jest.Mock).mockImplementation(() => {
      callOrder.push("parse");
      return [
        { type: "content", xpath: "/p[1]", motherTongue: false, text: "Luke" },
        { type: "content", xpath: "/p[2]", motherTongue: false, text: "1:26–38" },
      ];
    });

    await reparseLesson(lesson, storage);

    expect(splitSpy).toHaveBeenCalled();
    expect(callOrder).toEqual(["split", "parse"]);
  });

  // RED (task .2): a splitter/saveDocStrings failure for one master in the
  // FR-012 batch MUST NOT abort the remaining lessons (plan.md "Batch
  // re-processing partial-failure handling & resumability" MEDIUM finding) —
  // reparseEnglish MUST continue-on-error, logging a per-lesson
  // success/skip/failure result plus a final summary count. Confirmed
  // failing against the current reparseEnglish.ts: its bare `for` loop has
  // no try/catch, so the injected failure on lesson A rejects the whole
  // reparseEnglish() call and lesson B is never processed — this fails with
  // the thrown error surfacing instead of being caught (an assertion error
  // on `resolves`, not a compile error). Activated by task .3 (GREEN).
  it("continues processing remaining lessons and logs a summary when one lesson fails", async () => {
    const FAILING_LESSON_ID = 21;
    const SUCCEEDING_LESSON_ID = 22;

    const failingLesson: BaseLesson = baseLesson({ lessonId: FAILING_LESSON_ID, lesson: 1 });
    const succeedingLesson: BaseLesson = baseLesson({ lessonId: SUCCEEDING_LESSON_ID, lesson: 2 });

    const updateLessonCalls: number[] = [];
    const storage: Persistence = {
      languages: async () => [],
      language: async () => null,
      createLanguage: async () => {
        throw new Error("not implemented in fixture");
      },
      updateLanguage: async () => {
        throw new Error("not implemented in fixture");
      },
      invalidCode: async () => false,
      lessons: async () => [failingLesson, succeedingLesson],
      lesson: async () => null,
      oldLessonStrings: async () => [],
      createLesson: async () => {
        throw new Error("not implemented in fixture");
      },
      updateLesson: async (id: number, lessonVersion: number) => {
        updateLessonCalls.push(id);
        return {
          ...baseLesson({ lessonId: id, version: lessonVersion }),
          lessonStrings: [],
        };
      },
      tStrings: async () => [],
      englishScriptureTStrings: async () => [],
      addOrFindMasterStrings: async (texts: string[]) =>
        texts.map((text, i) => ({ masterId: i, languageId: ENGLISH_ID, text, history: [] })),
      saveTStrings: async (tStrings) => tStrings,
      sync: async () => {
        throw new Error("not implemented in fixture");
      },
    } as Persistence;

    jest
      .spyOn(referenceSplitterModule, "splitReferencesInDocument")
      .mockImplementation((inDocPath: string) => {
        if (inDocPath.includes(`${FAILING_LESSON_ID}-`)) {
          throw new Error("simulated splitter failure for the failing lesson");
        }
      });
    (updateLessonModule.parseDocStrings as jest.Mock).mockReturnValue([
      { type: "content", xpath: "/p[1]", motherTongue: false, text: "Some text" },
    ]);

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(reparseEnglish(storage)).resolves.not.toThrow();

    // The succeeding lesson must still have been processed despite the
    // failing lesson erroring mid-batch.
    expect(updateLessonCalls).toContain(SUCCEEDING_LESSON_ID);
    expect(updateLessonCalls).not.toContain(FAILING_LESSON_ID);

    // A per-lesson failure result and a final summary count must be logged.
    const loggedMessages = logSpy.mock.calls.map((args) => args.join(" "));
    expect(
      loggedMessages.some(
        (msg) => msg.includes(String(FAILING_LESSON_ID)) && /fail|error|skip/i.test(msg)
      )
    ).toBe(true);
    expect(loggedMessages.some((msg) => /summary/i.test(msg))).toBe(true);
  });
});
